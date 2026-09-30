package net.hearth.canary.light

import okhttp3.OkHttpClient
import okhttp3.Protocol
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CanaryHttpCallPolicyTest {
    @Test
    fun controlHttpUsesGetHttp11AndTreatsAnyResponseAsSuccess() {
        val request = CanaryHttpCallPolicy.request("control_http", "https://example.test/", "tm-1")
        val client = CanaryHttpCallPolicy.controlClient(OkHttpClient())

        assertEquals("GET", request.method)
        assertEquals("tm-1", request.header("X-Canary-Device-Label"))
        assertEquals(listOf(Protocol.HTTP_1_1), client.protocols)
        assertTrue(CanaryHttpCallPolicy.isSuccessfulResponse("control_http", 403))
        assertTrue(CanaryHttpCallPolicy.isSuccessfulResponse("control_http", 500))
    }

    @Test
    fun serverHttpKeepsDefaultProtocolsAndRequestsFreshConnectionClose() {
        val baseClient = OkHttpClient()
        val client = CanaryHttpCallPolicy.freshServerClient(baseClient)
        val request = CanaryHttpCallPolicy.request("http_domain", "https://example.test/", "tm-1")

        assertEquals("GET", request.method)
        assertEquals("close", request.header("Connection"))
        assertEquals("tm-1", request.header("X-Canary-Device-Label"))
        assertEquals(baseClient.protocols, client.protocols)
        assertEquals(0, CanaryHttpCallPolicy.FRESH_SERVER_MAX_IDLE_CONNECTIONS)
        assertEquals(0, CanaryHttpCallPolicy.freshConnectionPool().idleConnectionCount())
    }

    @Test
    fun nonControlHttpStatusStillUsesStatusRange() {
        assertTrue(CanaryHttpCallPolicy.isSuccessfulResponse("http_domain", 204))
        assertNull(CanaryHttpCallPolicy.request("control_http", "https://example.test/").header("Connection"))
        assertFalse(CanaryHttpCallPolicy.isSuccessfulResponse("http_domain", 403))
    }

    @Test
    fun httpRequestsCarrySafeDeviceLabelForControlAndServerChecks() {
        val control = CanaryHttpCallPolicy.request("control_http", "https://example.test/", "tm-1")
        val server = CanaryHttpCallPolicy.request("http_domain", "https://example.test/", "tm-1")

        assertEquals("tm-1", control.header("X-Canary-Device-Label"))
        assertEquals("tm-1", server.header("X-Canary-Device-Label"))
    }

    @Test
    fun requestUsesUnknownDeviceLabelFallbackWhenHeaderValueIsMissingOrUnsafe() {
        val invalid = CanaryHttpCallPolicy.request("http_domain", "https://example.test/", "\n")

        assertEquals("unknown", CanaryCorrelation.safeDeviceLabel(null))
        assertEquals("unknown", invalid.header("X-Canary-Device-Label"))
    }

    @Test
    fun websocketRequestCarriesSafeDeviceLabelAndExactGeneratedConnectionId() {
        val connectionId = CanaryCorrelation.newConnectionId()
        val request = CanaryCorrelation.websocketRequest("wss://example.test/hearth-canary/", "tm-1", connectionId)

        assertTrue(UUID_REGEX.matches(connectionId))
        assertEquals("tm-1", request.header("X-Canary-Device-Label"))
        assertEquals(connectionId, request.header("X-Canary-Connection-Id"))
        assertEquals(connectionId, CanaryCorrelation.keepaliveResultConnectionId(connectionId))
        assertEquals(connectionId, CanaryCorrelation.keepaliveResultConnectionId(connectionId))
        assertNotEquals(connectionId, CanaryCorrelation.keepaliveResultConnectionId(null))
        assertTrue(UUID_REGEX.matches(CanaryCorrelation.keepaliveResultConnectionId(null)))
    }

    @Test
    fun websocketRequestUsesUnknownDeviceLabelFallbackWhenHeaderValueIsUnsafe() {
        val request = CanaryCorrelation.websocketRequest(
            "wss://example.test/hearth-canary/",
            "\r\n",
            "123e4567-e89b-12d3-a456-426614174000"
        )

        assertEquals("unknown", request.header("X-Canary-Device-Label"))
    }

    private companion object {
        val UUID_REGEX = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
    }
}
