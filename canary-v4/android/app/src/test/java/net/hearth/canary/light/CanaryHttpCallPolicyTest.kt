package net.hearth.canary.light

import okhttp3.OkHttpClient
import okhttp3.Protocol
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
    fun requestUsesUnknownDeviceLabelFallbackWhenHeaderValueIsUnsafe() {
        val request = CanaryHttpCallPolicy.request("control_http", "https://example.test/", "\n")

        assertEquals("unknown", request.header("X-Canary-Device-Label"))
    }

    @Test
    fun websocketRequestCarriesDeviceLabelAndExactConnectionId() {
        val connectionId = "123e4567-e89b-12d3-a456-426614174000"
        val request = CanaryCorrelation.websocketRequest("wss://example.test/hearth-canary/", "tm-1", connectionId)

        assertEquals("tm-1", request.header("X-Canary-Device-Label"))
        assertEquals(connectionId, request.header("X-Canary-Connection-Id"))
        assertEquals(connectionId, CanaryCorrelation.keepaliveResultConnectionId(connectionId))
    }
}
