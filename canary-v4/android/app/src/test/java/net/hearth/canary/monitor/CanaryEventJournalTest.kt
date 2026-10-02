package net.hearth.canary.monitor

import net.hearth.canary.full.CanaryServiceReachExecutor
import net.hearth.canary.full.CanaryServiceReachTransport
import net.hearth.canary.full.CanaryTlsReachTiming
import net.hearth.canary.ui.CanaryExportDeviceMetadata
import net.hearth.canary.ui.CanaryJournalExportFormatter
import net.hearth.canary.ui.CanaryJournalRecord
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Assert.assertSame
import org.junit.Test

class CanaryEventJournalTest {
    @Test
    fun prunesOnlyRecordsOlderThanThirtyDays() {
        val now = 2_000_000_000_000L
        val dao = FakeCanaryEventDao()
        val journal = CanaryEventJournal(dao) { now }
        dao.insert(entity("old", now - CanaryEventJournal.RETENTION_MS - 1L, 1L))
        dao.insert(entity("boundary", now - CanaryEventJournal.RETENTION_MS, 2L))
        dao.insert(entity("recent", now - 1L, 3L))

        journal.prune()

        assertEquals(listOf("boundary", "recent"), dao.oldestFirst(10).map { it.recordId })
    }

    @Test
    fun appendPreservesOrderingAndRoundTripsPayload() {
        var now = 3_000_000_000_000L
        val dao = FakeCanaryEventDao()
        val journal = CanaryEventJournal(dao) { now }
        val firstPayload = payload("first", "cycle_start")
        val secondPayload = payload("second", "run_summary")

        journal.append(firstPayload)
        now += 1L
        journal.append(secondPayload)

        assertEquals(listOf("second", "first"), journal.newestFirst(10).map { it.recordId })
        assertEquals(listOf("first", "second"), journal.oldestFirst(10).map { it.recordId })
        assertEquals("run_summary", JSONObject(journal.newestFirst(1).single().payloadJson).getString("testType"))
        assertEquals(3_000_000_000_001L, journal.newestFirst(1).single().timestampUtc)
        assertEquals(2, journal.count())
    }

    @Test
    fun appendRejectsPayloadMissingTimestampUtc() {
        val dao = FakeCanaryEventDao()
        val journal = CanaryEventJournal(dao) { 3_000_000_000_000L }
        val payload = JSONObject()
            .put("recordId", "missing")
            .put("testType", "cycle_start")
            .toString()

        assertThrows(IllegalArgumentException::class.java) {
            journal.append(payload)
        }
        assertEquals(0, journal.count())
    }

    @Test
    fun appendRejectsNullNonPositiveAndInvalidTimestampUtc() {
        val dao = FakeCanaryEventDao()
        val journal = CanaryEventJournal(dao) { 3_000_000_000_000L }
        val payloads = listOf(
            JSONObject().put("recordId", "null").put("timestampUtc", JSONObject.NULL),
            JSONObject().put("recordId", "zero").put("timestampUtc", 0L),
            JSONObject().put("recordId", "negative").put("timestampUtc", -1L),
            JSONObject().put("recordId", "invalid").put("timestampUtc", "not-a-number")
        )

        payloads.forEach { payload ->
            assertThrows(IllegalArgumentException::class.java) {
                journal.append(payload.put("testType", "cycle_start").toString())
            }
        }
        assertEquals(0, journal.count())
    }

    @Test
    fun cycleErrorPayloadContainsThrowableFieldsAndTruncatesStack() {
        val throwable = IllegalStateException("boom")
        throwable.stackTrace = (1..25).map {
            StackTraceElement("Class$it", "method$it", "File$it.kt", it)
        }.toTypedArray()

        val payload = cycleErrorPayload("watchdog_set_alarm_clock", throwable)

        assertEquals("cycle_error", payload.getString("testType"))
        assertEquals("watchdog_set_alarm_clock", payload.getString("phase"))
        assertEquals(IllegalStateException::class.java.name, payload.getString("exceptionClass"))
        assertEquals("boom", payload.getString("message"))
        assertEquals(20, payload.getString("stack").lineSequence().count())
        assertTrue(payload.getString("stack").contains("Class19"))
    }

    @Test
    fun cycleStartPayloadIncludesRunCorrelationAndNetworkFields() {
        val payload = cycleStartPayload(
            CycleStartFields(
                runId = "run-1",
                timestampUtc = 1_800_000_000_000L,
                wakeupMethod = "service",
                scheduledAt = 1_799_999_999_000L,
                delayMs = 1_000L,
                missedSinceLast = 0,
                batteryPct = 80,
                isCharging = true,
                batteryOptimizationIgnored = true,
                screenOn = true,
                deviceIdleMode = false,
                powerSaveMode = false,
                appStandbyBucket = 10,
                exactAlarmAllowed = true,
                notificationsAllowed = true,
                uptimeSec = 100L,
                processStartedAt = 1_799_999_900_000L,
                networkType = "wifi",
                wifiRssi = -55,
                wifiLinkMbps = 144,
                gmsAvailable = true
            )
        )

        assertEquals("cycle_start", payload.getString("testType"))
        assertEquals("run-1", payload.getString("runId"))
        assertEquals(1_800_000_000_000L, payload.getLong("timestampUtc"))
        assertEquals("wifi", payload.getString("networkType"))
        assertEquals(-55, payload.getInt("wifiRssi"))
        assertEquals(144, payload.getInt("wifiLinkMbps"))
        assertTrue(payload.getBoolean("screenOn"))
        assertEquals(false, payload.getBoolean("deviceIdleMode"))
        assertEquals(false, payload.getBoolean("powerSaveMode"))
        assertEquals(10, payload.getInt("appStandbyBucket"))
        assertTrue(payload.getBoolean("gmsAvailable"))
    }

    @Test
    fun cycleSkippedPayloadExplainsOverlapAndQueuedManualFull() {
        val payload = cycleSkippedPayload(
            wakeupMethod = CanaryWakeupMethod.MANUAL_FULL,
            scheduledAt = 1_800_000_000_000L,
            delayMs = 2_000L,
            reason = "overlap",
            requestedKind = "manual_full",
            currentRunId = "active-run",
            queued = true
        )

        assertEquals("cycle_skipped", payload.getString("testType"))
        assertEquals("overlap", payload.getString("reason"))
        assertEquals("manual_full", payload.getString("requestedKind"))
        assertEquals("active-run", payload.getString("currentRunId"))
        assertTrue(payload.getBoolean("queued"))
    }

    @Test
    fun cycleSkippedPayloadExplainsBudgetSuppressionWithoutActiveOverlap() {
        val payload = cycleSkippedPayload(
            wakeupMethod = CanaryWakeupMethod.SERVICE,
            scheduledAt = 1_800_000_000_000L,
            delayMs = 2_000L,
            reason = "budget",
            requestedKind = "full",
            currentRunId = null
        )

        assertEquals("budget", payload.getString("reason"))
        assertEquals("full", payload.getString("requestedKind"))
        assertTrue(payload.isNull("currentRunId"))
        assertEquals(false, payload.getBoolean("queued"))
    }

    @Test
    fun lightRunPayloadSerializesResolvedAddressesAsJsonArray() {
        val payload = lightRunPayload(
            "run-1",
            net.hearth.canary.light.CanaryTestResult(
                testType = "dns_resolve",
                target = "example.test",
                success = true,
                errorCategory = net.hearth.canary.light.CanaryErrorCategory.NONE,
                resolvedAddresses = listOf("203.0.113.1", "2001:db8::1"),
                networkType = "cellular",
                bytesTx = 12L,
                bytesRx = 34L
            )
        )

        val addresses = payload.get("resolvedAddresses")
        assertSame(org.json.JSONArray::class.java, addresses.javaClass)
        assertEquals("203.0.113.1", payload.getJSONArray("resolvedAddresses").getString(0))
        assertEquals("2001:db8::1", payload.getJSONArray("resolvedAddresses").getString(1))
        assertEquals("cellular", payload.getString("networkType"))
        assertEquals(12L, payload.getLong("bytesTx"))
        assertEquals(34L, payload.getLong("bytesRx"))
    }

    @Test
    fun lightRunPayloadSuppressesZeroTrafficCounters() {
        val payload = lightRunPayload(
            "run-1",
            net.hearth.canary.light.CanaryTestResult(
                testType = "control_dns",
                target = "example.test",
                success = true,
                errorCategory = net.hearth.canary.light.CanaryErrorCategory.NONE,
                networkType = "unknown",
                bytesTx = 0L,
                bytesRx = 0L
            )
        )

        assertEquals("unknown", payload.getString("networkType"))
        assertTrue(payload.isNull("bytesTx"))
        assertTrue(payload.isNull("bytesRx"))
    }

    @Test
    fun fullRunPayloadSerializesIpDirectProtocolAndHeartbeatStatusFields() {
        val ipDirectHttp = lightRunPayload(
            "run-1",
            net.hearth.canary.light.CanaryTestResult(
                testType = "ip_direct",
                target = "203.0.113.10",
                success = true,
                errorCategory = net.hearth.canary.light.CanaryErrorCategory.NONE,
                mode = "http",
                protocol = "http",
                sni = "vmi3376157.contaboserver.net"
            )
        )
        val ipDirectWs = lightRunPayload(
            "run-1",
            net.hearth.canary.light.CanaryTestResult(
                testType = "ip_direct",
                target = "203.0.113.10",
                success = true,
                errorCategory = net.hearth.canary.light.CanaryErrorCategory.NONE,
                mode = "ws",
                protocol = "ws",
                sni = "www.example.com"
            )
        )
        val heartbeat = lightRunPayload(
            "run-1",
            net.hearth.canary.light.CanaryTestResult(
                testType = "ws_heartbeat_status",
                target = "example.test",
                success = true,
                errorCategory = net.hearth.canary.light.CanaryErrorCategory.NONE,
                intervalSec = 240,
                alive = true,
                ageSec = 120L,
                pingsSent = 2,
                pongsMissed = 0,
                networkType = "wifi"
            )
        )
        val deadHeartbeat = lightRunPayload(
            "run-1",
            net.hearth.canary.light.CanaryTestResult(
                testType = "ws_heartbeat_status",
                target = "example.test",
                success = false,
                errorCategory = net.hearth.canary.light.CanaryErrorCategory.WS_CLOSED,
                intervalSec = 540,
                alive = false,
                ageSec = 3600L,
                pingsSent = 3,
                pongsMissed = 1,
                networkType = "cellular"
            )
        )

        assertEquals("http", ipDirectHttp.getString("protocol"))
        assertEquals("http", ipDirectHttp.getString("mode"))
        assertEquals("vmi3376157.contaboserver.net", ipDirectHttp.getString("sni"))
        assertEquals("ws", ipDirectWs.getString("protocol"))
        assertEquals("ws", ipDirectWs.getString("mode"))
        assertEquals("www.example.com", ipDirectWs.getString("sni"))
        assertEquals("ws_heartbeat_status", heartbeat.getString("testType"))
        assertEquals(240, heartbeat.getInt("intervalSec"))
        assertTrue(heartbeat.getBoolean("alive"))
        assertEquals(120L, heartbeat.getLong("ageSec"))
        assertEquals(2, heartbeat.getInt("pingsSent"))
        assertEquals(0, heartbeat.getInt("pongsMissed"))
        assertEquals(false, deadHeartbeat.getBoolean("success"))
        assertEquals(false, deadHeartbeat.getBoolean("alive"))
        assertEquals("ws_closed", deadHeartbeat.getString("errorCategory"))
    }

    @Test
    fun heartbeatDeathPayloadSerializesCorrelationStateAndDetector() {
        val payload = lightRunPayload(
            "run-1",
            net.hearth.canary.light.CanaryTestResult(
                testType = "ws_heartbeat_dead",
                target = "example.test",
                success = false,
                errorCategory = net.hearth.canary.light.CanaryErrorCategory.WS_CLOSED,
                connectionId = "connection-1",
                intervalSec = 60,
                ageSec = 3600L,
                closeCode = 1001,
                closeReason = "silence_timeout",
                reason = "callback_close",
                detectedBy = "onClosed",
                exceptionClass = "java.io.IOException",
                lastInboundAtMs = 1_000L,
                lastOutboundAtMs = 2_000L,
                networkType = "wifi",
                screenOn = true,
                deviceIdleMode = false
            )
        )

        assertEquals("connection-1", payload.getString("connectionId"))
        assertEquals(60, payload.getInt("intervalSec"))
        assertEquals(3600L, payload.getLong("ageSec"))
        assertEquals(1001, payload.getInt("closeCode"))
        assertEquals("silence_timeout", payload.getString("closeReason"))
        assertEquals("callback_close", payload.getString("reason"))
        assertEquals("onClosed", payload.getString("detectedBy"))
        assertEquals(1_000L, payload.getLong("lastInboundAtMs"))
        assertEquals(2_000L, payload.getLong("lastOutboundAtMs"))
        assertEquals("wifi", payload.getString("networkType"))
        assertTrue(payload.getBoolean("screenOn"))
        assertEquals(false, payload.getBoolean("deviceIdleMode"))
    }

    @Test
    fun heartbeatStatusPayloadCoversAllIntervalsAndSuccessMatchesAlive() {
        val payloads = listOf(
            60 to true,
            240 to true,
            540 to false
        ).map { (interval, alive) ->
            lightRunPayload(
                "run-1",
                net.hearth.canary.light.CanaryTestResult(
                    testType = "ws_heartbeat_status",
                    target = "example.test",
                    success = alive,
                    errorCategory = if (alive) {
                        net.hearth.canary.light.CanaryErrorCategory.NONE
                    } else {
                        net.hearth.canary.light.CanaryErrorCategory.WS_CLOSED
                    },
                    intervalSec = interval,
                    alive = alive,
                    ageSec = interval.toLong(),
                    pingsSent = 1,
                    pongsMissed = if (alive) 0 else 1,
                    networkType = "wifi"
                )
            )
        }

        assertEquals(listOf(60, 240, 540), payloads.map { it.getInt("intervalSec") })
        payloads.forEach { payload ->
            assertEquals(payload.getBoolean("alive"), payload.getBoolean("success"))
        }
    }

    @Test
    fun serviceReachPayloadSerializesReachabilityFields() {
        val payload = lightRunPayload(
            "run-1",
            net.hearth.canary.light.CanaryTestResult(
                testType = "service_reach",
                target = "www.google.com:443",
                success = true,
                errorCategory = net.hearth.canary.light.CanaryErrorCategory.NONE,
                service = "google",
                host = "www.google.com",
                port = 443,
                protocol = "tls",
                mode = "tls",
                certTrusted = true,
                tcpMs = 12,
                tlsMs = 34
            )
        )

        assertEquals("google", payload.getString("service"))
        assertEquals("www.google.com", payload.getString("host"))
        assertEquals(443, payload.getInt("port"))
        assertEquals("tls", payload.getString("protocol"))
        assertEquals("tls", payload.getString("mode"))
        assertTrue(payload.getBoolean("certTrusted"))
        assertEquals(12L, payload.getLong("tcpMs"))
        assertEquals(34L, payload.getLong("tlsMs"))
    }

    @Test
    fun manualServiceReachCoordinatorPersistsResultsWithOneRunIdAndExportedFields() {
        val dao = FakeCanaryEventDao()
        val journal = CanaryEventJournal(dao) { CanaryEventJournal.RETENTION_MS + 1L }
        val executor = CanaryServiceReachExecutor(
            transport = object : CanaryServiceReachTransport {
                override fun tlsHandshake(host: String, port: Int, sniHost: String?, timeoutMs: Int): CanaryTlsReachTiming =
                    CanaryTlsReachTiming(tcpMs = 10, tlsMs = 20)

                override fun tlsHandshakeAnyCert(host: String, port: Int, sniHost: String?, timeoutMs: Int): CanaryTlsReachTiming =
                    CanaryTlsReachTiming(tcpMs = 11, tlsMs = 21, certTrusted = false)

                override fun tcpConnect(host: String, port: Int, timeoutMs: Int): Long = 12

                override fun stunBinding(host: String, port: Int, request: ByteArray, transactionId: ByteArray, timeoutMs: Int): Long = 13
            }
        )

        val results = CanaryManualServiceReachCoordinator(
            executor = executor,
            journal = journal,
            runIdFactory = { "manual-run-1" }
        ).runAndPersist()
        val export = JSONObject(
            CanaryJournalExportFormatter.buildExportJson(
                exportedAtUtc = 3_000_000_000_100L,
                appVersion = "4.1.4",
                deviceLabel = "test-device",
                deviceMetadata = CanaryExportDeviceMetadata("", "", ""),
                records = journal.oldestFirst(Int.MAX_VALUE).map { CanaryJournalRecord(it.timestampUtc, it.payloadJson) }
            )
        )
        val records = export.getJSONArray("records").serviceReachRecords()

        assertEquals(results.size, records.length())
        assertTrue(records.length() > 0)
        repeat(records.length()) { index ->
            val record = records.getJSONObject(index)
            assertEquals("manual-run-1", record.getString("runId"))
            assertEquals("service_reach", record.getString("testType"))
            assertTrue(record.has("service"))
            assertTrue(record.has("host"))
            assertTrue(record.has("port"))
            assertTrue(record.has("protocol"))
            assertTrue(record.has("mode"))
            assertTrue(record.has("success"))
            assertTrue(record.has("errorCategory"))
            assertTrue(record.has("errorDetail"))
            assertTrue(record.has("tcpMs"))
            assertTrue(record.has("tlsMs"))
            assertTrue(record.has("udpMs"))
            assertTrue(record.has("certTrusted"))
        }
        assertEquals(1, (0 until records.length()).map { records.getJSONObject(it).getString("runId") }.toSet().size)
    }

    @Test
    fun runSummaryPayloadIncludesAggregateTrafficCounters() {
        val payload = runSummaryPayload(
            "run-1",
            net.hearth.canary.light.CanaryRunSummary(
                testsTotal = 9,
                testsOk = 9,
                runVerdict = net.hearth.canary.light.CanaryRunVerdict.OK,
                bytesTx = 123L,
                bytesRx = 456L
            )
        )

        assertEquals("run_summary", payload.getString("testType"))
        assertEquals(123L, payload.getLong("bytesTx"))
        assertEquals(456L, payload.getLong("bytesRx"))
    }

    @Test
    fun runSummaryPayloadSuppressesInvalidNegativeTrafficCounters() {
        val payload = runSummaryPayload(
            "run-1",
            net.hearth.canary.light.CanaryRunSummary(
                testsTotal = 9,
                testsOk = 8,
                runVerdict = net.hearth.canary.light.CanaryRunVerdict.PARTIAL,
                bytesTx = -1L,
                bytesRx = -2L
            )
        )

        assertTrue(payload.isNull("bytesTx"))
        assertTrue(payload.isNull("bytesRx"))
    }

    @Test
    fun wsClosedEventPayloadSerializesCallbackClosureContext() {
        val payload = wsClosedEventPayload(
            net.hearth.canary.light.CanaryWsClosedEvent(
                timestampUtc = 1_900_000_000_000L,
                connectionId = "connection-1",
                ageSec = 42L,
                closeCode = 1000,
                exceptionClass = null,
                networkType = "wifi",
                screenOn = true,
                detectedBy = "callback"
            )
        )

        assertEquals("ws_closed_event", payload.getString("testType"))
        assertEquals(1_900_000_000_000L, payload.getLong("timestampUtc"))
        assertEquals("connection-1", payload.getString("connectionId"))
        assertEquals(42L, payload.getLong("ageSec"))
        assertEquals(1000, payload.getInt("closeCode"))
        assertTrue(payload.isNull("exceptionClass"))
        assertEquals("wifi", payload.getString("networkType"))
        assertTrue(payload.getBoolean("screenOn"))
        assertEquals("callback", payload.getString("detectedBy"))
    }

    private fun payload(recordId: String, testType: String): String =
        JSONObject()
            .put("recordId", recordId)
            .put("timestampUtc", when (recordId) {
                "first" -> 3_000_000_000_000L
                else -> 3_000_000_000_001L
            })
            .put("testType", testType)
            .put("value", "round-trip")
            .toString()

    private fun entity(recordId: String, timestampUtc: Long, sequence: Long): CanaryEventEntity =
        CanaryEventEntity(
            recordId = recordId,
            timestampUtc = timestampUtc,
            sequence = sequence,
            payloadJson = payload(recordId, "seed")
        )

    private fun JSONArray.serviceReachRecords(): JSONArray {
        val filtered = JSONArray()
        repeat(length()) { index ->
            val record = getJSONObject(index)
            if (record.getString("testType") == "service_reach") {
                filtered.put(record)
            }
        }
        return filtered
    }
}

private class FakeCanaryEventDao : CanaryEventDao {
    private val events = mutableListOf<CanaryEventEntity>()

    override fun insert(event: CanaryEventEntity) {
        require(events.none { it.recordId == event.recordId })
        events += event
    }

    override fun deleteOlderThan(cutoffUtc: Long): Int {
        val before = events.size
        events.removeAll { it.timestampUtc < cutoffUtc }
        return before - events.size
    }

    override fun count(): Int = events.size

    override fun maxSequence(): Long =
        events.maxOfOrNull { it.sequence } ?: 0L

    override fun newestFirst(limit: Int): List<CanaryEventEntity> =
        events.sortedWith(compareByDescending<CanaryEventEntity> { it.timestampUtc }.thenByDescending { it.sequence })
            .take(limit)

    override fun oldestFirst(limit: Int): List<CanaryEventEntity> =
        events.sortedBy { it.sequence }.take(limit)

    override fun unsentOldestFirst(limit: Int): List<CanaryEventEntity> =
        events.filter { it.sentAtUtc == null }.sortedBy { it.sequence }.take(limit)

    override fun markSent(recordIds: List<String>, sentAtUtc: Long): Int {
        var marked = 0
        events.replaceAll { event ->
            if (event.recordId in recordIds) {
                marked += 1
                event.copy(sentAtUtc = sentAtUtc)
            } else {
                event
            }
        }
        return marked
    }

    override fun since(sinceUtc: Long): List<CanaryEventEntity> =
        events.filter { it.timestampUtc >= sinceUtc }.sortedBy { it.sequence }
}
