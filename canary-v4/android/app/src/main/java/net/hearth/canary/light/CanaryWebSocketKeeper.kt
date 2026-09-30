package net.hearth.canary.light

import android.content.Context
import net.hearth.canary.BuildConfig
import net.hearth.canary.monitor.CanaryEventLog
import net.hearth.canary.monitor.CanarySystemSnapshot
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

class CanaryWebSocketKeeper private constructor(
    context: Context,
    private val closedEventReporter: CanaryWsClosedEventReporter,
    private val stateProvider: CanaryWsStateProvider
) {
    private val client = buildClient()
    private val deviceLabel = CanaryCorrelation.deviceLabel(context)
    private val lock = Any()
    private var socket: WebSocket? = null
    private var connectionId: String? = null
    private var connectedAtMs: Long = 0L
    private val processMarker = PROCESS_MARKER

    fun checkKeepalive(): CanaryTestResult {
        val startedAt = System.currentTimeMillis()
        val current = ensureSocket()
        val id = CanaryCorrelation.keepaliveResultConnectionId(connectionId)
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
            val id = CanaryCorrelation.newConnectionId()
            val connectedAt = System.currentTimeMillis()
            val listener = Listener(id, connectedAt)
            currentListener.set(listener)
            val request = CanaryCorrelation.websocketRequest(
                CanaryLightRunExecutor.SERVER_WS_URL,
                deviceLabel,
                id
            )
            connectionId = id
            socket = client.newWebSocket(request, listener)
            connectedAtMs = connectedAt
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

    private inner class Listener(
        private val listenerConnectionId: String,
        private val listenerConnectedAtMs: Long
    ) : WebSocketListener() {
        @Volatile
        var nextPong: ExpectedPong? = null
        private val reported = AtomicBoolean(false)

        override fun onMessage(webSocket: WebSocket, text: String) {
            val expected = nextPong
            if (expected != null && text == expected.payload) {
                expected.latch.countDown()
                nextPong = null
            }
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            nextPong = null
            reportClosed(closeCode = code, exceptionClass = null)
            clearSocket(listenerConnectionId)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            nextPong = null
            reportClosed(closeCode = null, exceptionClass = t.javaClass.name)
            clearSocket(listenerConnectionId)
        }

        private fun reportClosed(closeCode: Int?, exceptionClass: String?) {
            if (!reported.compareAndSet(false, true)) return

            val state = stateProvider.snapshot()
            closedEventReporter.report(
                CanaryWsClosedEvent(
                    timestampUtc = System.currentTimeMillis(),
                    connectionId = listenerConnectionId,
                    ageSec = ((System.currentTimeMillis() - listenerConnectedAtMs).coerceAtLeast(0L)) / 1000L,
                    closeCode = closeCode,
                    exceptionClass = exceptionClass,
                    networkType = state.networkType,
                    screenOn = state.screenOn,
                    detectedBy = "callback"
                )
            )
        }
    }

    private fun clearSocket(closedConnectionId: String) {
        synchronized(lock) {
            if (connectionId == closedConnectionId) {
                socket = null
                connectionId = null
                connectedAtMs = 0L
            }
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
                shared ?: CanaryWebSocketKeeper(
                    context,
                    AndroidCanaryWsClosedEventReporter(context.applicationContext),
                    AndroidCanaryWsStateProvider(context.applicationContext)
                ).also { shared = it }
            }
    }
}

interface CanaryWsClosedEventReporter {
    fun report(event: CanaryWsClosedEvent)
}

data class CanaryWsState(
    val networkType: String,
    val screenOn: Boolean?
)

interface CanaryWsStateProvider {
    fun snapshot(): CanaryWsState
}

private class AndroidCanaryWsClosedEventReporter(private val context: Context) : CanaryWsClosedEventReporter {
    override fun report(event: CanaryWsClosedEvent) {
        runCatching {
            CanaryEventLog(context.applicationContext).appendWsClosedEvent(event)
        }
    }
}

private class AndroidCanaryWsStateProvider(private val context: Context) : CanaryWsStateProvider {
    override fun snapshot(): CanaryWsState {
        val state = CanarySystemSnapshot.collectWsState(context.applicationContext)
        return CanaryWsState(
            networkType = state.networkType,
            screenOn = state.screenOn
        )
    }
}
