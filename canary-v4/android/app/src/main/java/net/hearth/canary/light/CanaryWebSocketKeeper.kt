package net.hearth.canary.light

import android.content.Context
import net.hearth.canary.BuildConfig
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class CanaryWebSocketKeeper private constructor(context: Context) {
    private val client = buildClient()
    private val lock = Any()
    private var socket: WebSocket? = null
    private var connectionId: String? = null
    private var connectedAtMs: Long = 0L
    private val processMarker = PROCESS_MARKER

    fun checkKeepalive(): CanaryTestResult {
        val startedAt = System.currentTimeMillis()
        val current = ensureSocket()
        val id = connectionId ?: UUID.randomUUID().toString()
        val ageSec = ((startedAt - connectedAtMs).coerceAtLeast(0L)) / 1000L
        val latch = CountDownLatch(1)
        val pingPayload = "canary-ping:${UUID.randomUUID()}"
        val listener = currentListener.get()
        listener?.nextPong = ExpectedPong(pingPayload, latch)

        val sent = current.send(pingPayload)
        val success = sent && latch.await(5, TimeUnit.SECONDS)
        if (!success) {
            reopen()
        }

        return CanaryTestResult(
            testType = "ws_keepalive",
            target = CanaryLightRunExecutor.SERVER_WS_URL,
            success = success,
            errorCategory = if (success) CanaryErrorCategory.NONE else CanaryErrorCategory.WS_TIMEOUT,
            errorDetail = if (success) null else "WebSocket keepalive did not complete within 5 seconds",
            latencyMs = System.currentTimeMillis() - startedAt,
            phases = CanaryPhases(upgradeMs = if (success) 0 else -1),
            connectionId = id,
            ageSec = ageSec,
            sameProcess = processMarker == PROCESS_MARKER
        )
    }

    private fun ensureSocket(): WebSocket {
        synchronized(lock) {
            socket?.let { return it }
            val id = UUID.randomUUID().toString()
            val listener = Listener()
            currentListener.set(listener)
            val request = Request.Builder()
                .url(CanaryLightRunExecutor.SERVER_WS_URL)
                .build()
            socket = client.newWebSocket(request, listener)
            connectionId = id
            connectedAtMs = System.currentTimeMillis()
            return socket!!
        }
    }

    private fun reopen() {
        synchronized(lock) {
            socket?.cancel()
            socket = null
            connectionId = null
            connectedAtMs = 0L
            ensureSocket()
        }
    }

    private fun buildClient(): OkHttpClient {
        val pins = listOf(
            BuildConfig.CANARY_TLS_PIN_SHA256_1,
            BuildConfig.CANARY_TLS_PIN_SHA256_2
        ).filter { it.isNotBlank() }
        val builder = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .pingInterval(0, TimeUnit.SECONDS)
        if (pins.isNotEmpty()) {
            val pinner = CertificatePinner.Builder().apply {
                pins.forEach { pin ->
                    add(
                        CanaryLightRunExecutor.SERVER_HOST,
                        if (pin.startsWith("sha256/")) pin else "sha256/$pin"
                    )
                }
            }.build()
            builder.certificatePinner(pinner)
        }
        return builder.build()
    }

    private class Listener : WebSocketListener() {
        @Volatile
        var nextPong: ExpectedPong? = null

        override fun onMessage(webSocket: WebSocket, text: String) {
            val expected = nextPong
            if (expected != null && text == expected.payload) {
                expected.latch.countDown()
                nextPong = null
            }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            nextPong = null
        }
    }

    private data class ExpectedPong(
        val payload: String,
        val latch: CountDownLatch
    )

    companion object {
        private val PROCESS_MARKER = UUID.randomUUID().toString()
        private val currentListener = AtomicReference<Listener?>()
        @Volatile
        private var shared: CanaryWebSocketKeeper? = null

        fun shared(context: Context): CanaryWebSocketKeeper =
            shared ?: synchronized(this) {
                shared ?: CanaryWebSocketKeeper(context).also { shared = it }
            }
    }
}
