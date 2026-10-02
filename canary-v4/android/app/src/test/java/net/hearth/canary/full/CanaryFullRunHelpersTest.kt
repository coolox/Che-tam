package net.hearth.canary.full

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.time.ZoneId
import java.util.Base64

class CanaryFullRunHelpersTest {
    @Test
    fun plannerSelectsFullOnlyOnHourlySlots() {
        assertEquals(CanaryRunKind.FULL, CanaryRunPlanner.kindForSlot(3_600_000L))
        assertEquals(CanaryRunKind.LIGHT, CanaryRunPlanner.kindForSlot(4_500_000L))
    }

    @Test
    fun uploadScheduleMatchesSixHourAndDailyWindows() {
        assertEquals(listOf(20 * 1024, 120 * 1024, 500 * 1024), CanaryUploadSchedule.smallPayloadsForUtcHour(6))
        assertEquals(emptyList<Int>(), CanaryUploadSchedule.smallPayloadsForUtcHour(7))
        assertTrue(CanaryUploadSchedule.includeDailyPayload(0))
        assertFalse(CanaryUploadSchedule.includeDailyPayload(12))
    }

    @Test
    fun fullUploadPlannerKeepsManualPayloadIndependentFromSchedule() {
        assertEquals(listOf(120 * 1024), CanaryFullUploadPlanner.payloadsForRun("manual_full", 25_200_000L, includeDailyUpload = false))
        assertEquals(listOf(120 * 1024), CanaryFullUploadPlanner.payloadsForRun("manual_full", 21_600_000L, includeDailyUpload = true))
        assertEquals(
            listOf(20 * 1024, 120 * 1024, 500 * 1024),
            CanaryFullUploadPlanner.payloadsForRun("service", 21_600_000L, includeDailyUpload = false)
        )
        assertEquals(
            listOf(20 * 1024, 120 * 1024, 500 * 1024, 2 * 1024 * 1024),
            CanaryFullUploadPlanner.payloadsForRun("service", 0L, includeDailyUpload = true)
        )
    }

    @Test
    fun dohQueryUsesRfc8484WireFormatBase64Url() {
        val queryParam = CanaryDohMessage.queryParam("vmi3376157.contaboserver.net", CanaryDohMessage.TYPE_A)
        val decoded = Base64.getUrlDecoder().decode(queryParam)

        assertFalse(queryParam.contains("="))
        assertEquals(0x48, decoded[0].toInt() and 0xff)
        assertEquals(0x43, decoded[1].toInt() and 0xff)
        assertTrue(decoded.toString(Charsets.ISO_8859_1).contains("vmi3376157"))
    }

    @Test
    fun dohParserKeepsOnlyUsableWireAddressAnswers() {
        val message = dnsResponse(
            answers = listOf(
                DnsAnswer(CanaryDohMessage.TYPE_A, byteArrayOf(203.toByte(), 0, 113, 10)),
                DnsAnswer(CanaryDohMessage.TYPE_A, byteArrayOf(127, 0, 0, 1)),
                DnsAnswer(CanaryDohMessage.TYPE_AAAA, byteArrayOf(0x20, 0x01, 0x0d, 0xb8.toByte()) + ByteArray(12))
            )
        )

        assertEquals(listOf("203.0.113.10", "2001:db8:0:0:0:0:0:0"), CanaryDohMessage.parseValidAddresses(message))
    }

    @Test
    fun dohParserAbortsSafelyOnMalformedAnswerName() {
        val message = dnsResponse(
            answers = listOf(
                DnsAnswer(CanaryDohMessage.TYPE_A, byteArrayOf(203.toByte(), 0, 113, 10)),
                DnsAnswer(CanaryDohMessage.TYPE_A, byteArrayOf(203.toByte(), 0, 113, 11))
            )
        ).copyOf().also { bytes ->
            val firstAnswerOffset = CanaryDohMessage.query("vmi3376157.contaboserver.net", CanaryDohMessage.TYPE_A).size
            val secondAnswerOffset = firstAnswerOffset + 16
            bytes[secondAnswerOffset] = 0x3f
        }

        assertEquals(emptyList<String>(), CanaryDohMessage.parseValidAddresses(message))
    }

    @Test
    fun dohProvidersUseRfc8484Endpoints() {
        assertEquals(
            listOf(
                "cloudflare:https://cloudflare-dns.com/dns-query:application/dns-message",
                "google:https://dns.google/dns-query:application/dns-message",
                "quad9:https://dns.quad9.net/dns-query:application/dns-message"
            ),
            CanaryFullRunExecutor.DOH_PROVIDERS.map { "${it.name}:${it.url}:${CanaryFullRunExecutor.DOH_ACCEPT_HEADER}" }
        )
    }

    @Test
    fun latencyStatsReportLossAndPercentiles() {
        val aggregate = CanaryLatencyStats.aggregate(listOf(40, 10, 30), attempted = 5)

        assertEquals(3, aggregate.count)
        assertEquals(10L, aggregate.minMs)
        assertEquals(30L, aggregate.medianMs)
        assertEquals(40L, aggregate.p90Ms)
        assertEquals(40L, aggregate.maxMs)
        assertEquals(2, aggregate.lost)
    }

    @Test
    fun secretScrubberRedactsAuthAndTurnUser() {
        val scrubbed = CanarySecretScrubber.safeError(
            "X-Canary-Key: abc Authorization=Bearer-token 1790000000:hearth-canary failed"
        )

        assertTrue(scrubbed!!.contains("X-Canary-Key=<redacted>"))
        assertTrue(scrubbed.contains("Authorization=<redacted>"))
        assertTrue(scrubbed.contains("<turn-username>"))
        assertFalse(scrubbed.contains("1790000000:hearth-canary"))
    }

    @Test
    fun payloadThroughputRejectsInvalidInputs() {
        assertEquals(16L, CanaryPayloadMetrics.throughputKbps(2_000, 1_000))
        assertNull(CanaryPayloadMetrics.throughputKbps(0, 1_000))
        assertNull(CanaryPayloadMetrics.throughputKbps(2_000, 0))
    }

    @Test
    fun endpointListsAndHeartbeatIntervalsAreCanonical() {
        assertEquals(listOf("cloudflare", "google", "quad9"), CanaryFullRunExecutor.DOH_PROVIDERS.map { it.name })
        assertEquals(
            listOf("vmi3376157.contaboserver.net", "www.example.com"),
            CanaryFullRunExecutor.DIRECT_SNI_HOSTS
        )
        assertEquals(
            listOf(
                "mtalk.google.com:5228",
                "mtalk.google.com:443",
                "fcm.googleapis.com:443",
                "firebaseinstallations.googleapis.com:443",
                "android.clients.google.com:443"
            ),
            CanaryFullRunExecutor.FCM_REACH_TARGETS.map { "${it.host}:${it.port}" }
        )
        assertEquals(listOf(60, 240, 540), CanaryFullRunExecutor.HEARTBEAT_INTERVALS)
    }

    @Test
    fun turnCredentialParserAcceptsStandardCredentialAndLegacyPassword() {
        val standard = CanaryTurnCredentialParser.parse(
            """{"ttlSec":600,"username":"1900000000:hearth-canary","credential":"example-credential"}""",
            nowEpochSec = 1_899_999_400L
        )
        val legacy = CanaryTurnCredentialParser.parse(
            """{"ttlSec":600,"username":"1900000000:hearth-canary","password":"legacy-password"}""",
            nowEpochSec = 1_899_999_400L
        )

        assertEquals("1900000000:hearth-canary", standard.username)
        assertEquals("example-credential", standard.password)
        assertEquals(600L, standard.ttlSec)
        assertEquals("legacy-password", legacy.password)
        assertEquals(
            "example-credential",
            CanaryTurnCredentialParser.parse(
                """{"ttlSec":600,"username":"1900003600:hearth-canary","credential":"example-credential"}""",
                nowEpochSec = 1_899_999_400L
            ).password
        )
    }

    @Test
    fun turnCredentialParserRejectsMissingCredentialInvalidUsernameAndTtl() {
        assertThrows(IllegalStateException::class.java) {
            CanaryTurnCredentialParser.parse(
                """{"ttlSec":600,"username":"1900000000:hearth-canary"}""",
                nowEpochSec = 1_899_999_400L
            )
        }
        assertThrows(IllegalStateException::class.java) {
            CanaryTurnCredentialParser.parse(
                """{"ttlSec":600,"username":"hearth-canary","credential":"example-credential"}""",
                nowEpochSec = 1_899_999_400L
            )
        }
        assertThrows(IllegalStateException::class.java) {
            CanaryTurnCredentialParser.parse(
                """{"ttlSec":600,"username":"1899999999:hearth-canary","credential":"example-credential"}""",
                nowEpochSec = 1_900_000_000L
            )
        }
        assertThrows(IllegalStateException::class.java) {
            CanaryTurnCredentialParser.parse(
                """{"ttlSec":0,"username":"1900000000:hearth-canary","credential":"example-credential"}""",
                nowEpochSec = 1_899_999_400L
            )
        }
    }

    @Test
    fun heartbeatStatusStateTracksAgePingsMissesAndDeath() {
        val fresh = CanaryHeartbeatStatusState(intervalSec = 60, connectedAtMs = 1_000L)
        val ok = fresh.sentPing(missed = false)
        val missed = ok.sentPing(missed = true)

        assertEquals(2L, fresh.ageSec(3_000L))
        assertTrue(ok.alive)
        assertEquals(1, ok.pingsSent)
        assertEquals(0, ok.pongsMissed)
        assertFalse(missed.alive)
        assertEquals(2, missed.pingsSent)
        assertEquals(1, missed.pongsMissed)
        assertFalse(missed.dead().alive)
    }

    @Test
    fun serviceReachUiErrorSummaryScrubsAndBoundsDisplayText() {
        val summary = CanaryServiceReachUiErrorSummary.format(
            "X-Canary-Key: abc ${"x".repeat(200)} 1900000000:hearth-canary"
        )

        assertTrue(summary!!.length <= 120)
        assertTrue(summary.contains("X-Canary-Key=<redacted>"))
        assertFalse(summary.contains("abc"))
        assertFalse(summary.contains("1900000000:hearth-canary"))
    }

    @Test
    fun heartbeatPayloadUsesClientDeclaredSilenceWindow() {
        val payload = org.json.JSONObject(CanaryHeartbeatPayload.text(60, "connection-id", 1234L))

        assertEquals("ws_heartbeat", payload.getString("type"))
        assertEquals(60, payload.getInt("intervalSec"))
        assertEquals(150, payload.getInt("disconnectAfterSec"))
        assertEquals(600, CanaryHeartbeatPayload.disconnectAfterSec(240))
        assertEquals(1350, CanaryHeartbeatPayload.disconnectAfterSec(540))
    }

    @Test
    fun nightlyJournalWindowIsLocalThreeWithJitterWindow() {
        val zone = ZoneId.of("UTC")

        assertTrue(CanaryFullRunExecutor.shouldRunNightlyJournalUpload(10_800_000L, zone))
        assertTrue(CanaryFullRunExecutor.shouldRunNightlyJournalUpload(12_600_000L, zone))
        assertFalse(CanaryFullRunExecutor.shouldRunNightlyJournalUpload(12_660_000L, zone))
    }

    @Test
    fun nightlyPlannerPersistsOneSuccessfulLocalDayAndAllowsRetryBeforeSuccess() {
        val zone = ZoneId.of("UTC")
        val decision = CanaryNightlyJournalPlanner.decide(
            nowMs = 12_000_000L,
            zoneId = zone,
            lastAttemptDay = null,
            jitterProvider = { 20 }
        )

        assertTrue(decision.shouldAttempt)
        assertEquals("1970-01-01", decision.localDay)
        assertFalse(
            CanaryNightlyJournalPlanner.decide(13_000_000L, zone, decision.localDay) { 20 }.shouldAttempt
        )
        assertTrue(
            CanaryNightlyJournalPlanner.decide(13_000_000L, zone, null) { 20 }.shouldAttempt
        )
    }

    @Test
    fun turnMessagesContainRealStunAttributesAndAuthIntegrity() {
        val challenge = CanaryTurnMessage.allocateChallenge(ByteArray(12) { 1 })
        val authenticated = CanaryTurnMessage.allocateAuthenticated(
            username = "1790000000:hearth-canary",
            realm = "example.org",
            nonce = "nonce",
            password = "password",
            transactionId = ByteArray(12) { 2 }
        )
        val permission = CanaryTurnMessage.createPermission(
            username = "1790000000:hearth-canary",
            realm = "example.org",
            nonce = "nonce",
            password = "password",
            peerHost = CanaryFullRunExecutor.TURN_ECHO_HOST,
            peerPort = CanaryFullRunExecutor.TURN_ECHO_PORT,
            transactionId = ByteArray(12) { 3 }
        )
        val send = CanaryTurnMessage.sendIndication(
            CanaryFullRunExecutor.TURN_ECHO_HOST,
            CanaryFullRunExecutor.TURN_ECHO_PORT,
            ByteArray(8 * 1024) { 7 },
            ByteArray(12) { 4 }
        )

        assertEquals(CanaryTurnMessage.METHOD_ALLOCATE, CanaryTurnMessage.type(challenge))
        assertTrue(CanaryTurnMessage.attributes(authenticated).any { it.type == CanaryTurnMessage.ATTR_MESSAGE_INTEGRITY })
        assertTrue(CanaryTurnMessage.attributes(permission).any { it.type == CanaryTurnMessage.ATTR_XOR_PEER_ADDRESS })
        assertEquals(CanaryTurnMessage.METHOD_SEND, CanaryTurnMessage.type(send))
        assertEquals(8 * 1024, CanaryTurnMessage.dataAttribute(send)!!.size)
    }

    private data class DnsAnswer(val type: Int, val data: ByteArray)

    private fun dnsResponse(answers: List<DnsAnswer>): ByteArray {
        val out = ByteArrayOutputStream()
        writeU16(out, 0x4843)
        writeU16(out, 0x8180)
        writeU16(out, 1)
        writeU16(out, answers.size)
        writeU16(out, 0)
        writeU16(out, 0)
        val query = CanaryDohMessage.query("vmi3376157.contaboserver.net", CanaryDohMessage.TYPE_A)
        out.write(query, 12, query.size - 12)
        answers.forEach { answer ->
            writeU16(out, 0xC00C)
            writeU16(out, answer.type)
            writeU16(out, 1)
            out.write(byteArrayOf(0, 0, 0, 60))
            writeU16(out, answer.data.size)
            out.write(answer.data)
        }
        return out.toByteArray()
    }

    private fun writeU16(out: ByteArrayOutputStream, value: Int) {
        out.write((value ushr 8) and 0xff)
        out.write(value and 0xff)
    }
}
