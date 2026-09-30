package net.hearth.canary.full

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId

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
    fun dohParserKeepsOnlyUsableAddressAnswers() {
        val json = """
            {"Answer":[{"data":"203.0.113.10"},{"data":"127.0.0.1"},{"data":"not-address"}]}
        """.trimIndent()

        assertEquals(listOf("203.0.113.10"), CanaryDohParser.parseValidAddresses(json))
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
}
