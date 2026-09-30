package net.hearth.canary.light

import android.content.Context
import android.net.TrafficStats
import android.os.Looper
import android.os.Process
import net.hearth.canary.BuildConfig
import net.hearth.canary.ui.CanaryDeviceLabelStore
import okhttp3.Call
import okhttp3.CertificatePinner
import okhttp3.ConnectionPool
import okhttp3.EventListener
import okhttp3.Handshake
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Proxy
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class CanaryLightRunExecutor(
    context: Context,
    private val webSocketKeeper: CanaryWebSocketKeeper = CanaryWebSocketKeeper.shared(context)
) {
    private val appContext = context.applicationContext
    private val deviceLabel = CanaryCorrelation.deviceLabel(appContext)
    private val dnsState = CanaryDnsState(appContext)
    private val baseClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .callTimeout(12, TimeUnit.SECONDS)
        .build()

    fun run(): CanaryLightRun {
        CanaryLightRunThreadGuard.assertNotMainThread()
        val trafficBefore = CanaryTrafficSampler.sample()
        val results = mutableListOf<CanaryTestResult>()
        CONTROL_HTTP_TARGETS.forEach { target ->
            results += executeHttp("control_http", target, "https://$target/", controlClient())
        }
        results += resolveDns("control_dns", CONTROL_DNS_TARGET)
        results += resolveDns("dns_resolve", SERVER_HOST)
        results += executeHttp("http_domain", SERVER_HOST, SERVER_HTTP_URL, freshPinnedServerClient())
        results += webSocketKeeper.checkKeepalive()
        val trafficAfter = CanaryTrafficSampler.sample()
        return CanaryLightRun(
            results = results,
            traffic = CanaryTrafficDeltaCalculator.delta(trafficBefore, trafficAfter)
        )
    }

    private fun executeHttp(
        testType: String,
        target: String,
        url: String,
        client: OkHttpClient
    ): CanaryTestResult {
        val startedAt = System.currentTimeMillis()
        val trackerRef = AtomicReference<CanaryPhaseTracker>()
        val peerAddressRef = AtomicReference<InetAddress?>()
        val instrumented = client.newBuilder()
            .eventListenerFactory { InstrumentedEventListener(trackerRef, peerAddressRef) }
            .build()
        val request = CanaryHttpCallPolicy.request(testType, url, deviceLabel)

        return try {
            instrumented.newCall(request).execute().use { response ->
                val phases = trackerRef.get()?.snapshot() ?: CanaryPhases()
                val success = CanaryHttpCallPolicy.isSuccessfulResponse(testType, response.code)
                val peerAddress = peerAddressRef.get()
                CanaryTestResult(
                    testType = testType,
                    target = target,
                    success = success,
                    errorCategory = if (success) CanaryErrorCategory.NONE else CanaryErrorCategory.HTTP_ERROR,
                    errorDetail = if (success) null else "HTTP ${response.code}",
                    latencyMs = System.currentTimeMillis() - startedAt,
                    phases = phases,
                    resolvedIp = peerAddress?.hostAddress,
                    addressFamily = peerAddress?.let(CanaryAddressClassifier::family),
                    httpStatus = response.code
                )
            }
        } catch (throwable: Throwable) {
            val tracker = trackerRef.get()
            val failedStage = tracker?.fail()
            CanaryTestResult(
                testType = testType,
                target = target,
                success = false,
                errorCategory = CanaryErrorClassifier.classify(throwable, failedStage),
                errorDetail = throwable.message?.take(200),
                exceptionClass = throwable.javaClass.name,
                latencyMs = System.currentTimeMillis() - startedAt,
                phases = tracker?.snapshot() ?: CanaryPhases()
            )
        }
    }

    private fun resolveDns(testType: String, host: String): CanaryTestResult {
        val startedAt = System.currentTimeMillis()
        val tracker = CanaryPhaseTracker()
        tracker.dnsStart()
        return try {
            val addresses = InetAddress.getAllByName(host).toList()
            tracker.dnsEnd()
            val address = addresses.firstOrNull()
            val addressText = address?.hostAddress
            val addressTexts = addresses.mapNotNull { it.hostAddress }.take(10)
            val invalidAddress = address != null && CanaryAddressClassifier.isInvalidCanaryAddress(address)
            val previous = dnsState.previousIp(host, addressText)
            dnsState.remember(host, addressTexts)
            CanaryTestResult(
                testType = testType,
                target = host,
                success = address != null && !invalidAddress,
                errorCategory = when {
                    address == null -> CanaryErrorCategory.DNS_NXDOMAIN
                    invalidAddress -> CanaryErrorCategory.DNS_INVALID_ADDRESS
                    else -> CanaryErrorCategory.NONE
                },
                errorDetail = if (invalidAddress) "DNS returned private or loopback address" else null,
                latencyMs = System.currentTimeMillis() - startedAt,
                phases = tracker.snapshot(),
                resolvedIp = addressText,
                resolvedAddresses = addressTexts,
                addressFamily = address?.let(CanaryAddressClassifier::family),
                previousIp = previous,
                changed = previous != null && previous != addressText
            )
        } catch (throwable: Throwable) {
            val failedStage = tracker.fail()
            CanaryTestResult(
                testType = testType,
                target = host,
                success = false,
                errorCategory = CanaryErrorClassifier.classify(throwable, failedStage),
                errorDetail = throwable.message?.take(200),
                exceptionClass = throwable.javaClass.name,
                latencyMs = System.currentTimeMillis() - startedAt,
                phases = tracker.snapshot()
            )
        }
    }

    private fun controlClient(): OkHttpClient =
        CanaryHttpCallPolicy.controlClient(baseClient)

    private fun freshPinnedServerClient(): OkHttpClient =
        CanaryHttpCallPolicy.freshServerClient(pinnedClient())

    private fun pinnedClient(): OkHttpClient {
        val pins = listOf(
            BuildConfig.CANARY_TLS_PIN_SHA256_1,
            BuildConfig.CANARY_TLS_PIN_SHA256_2
        ).filter { it.isNotBlank() }
        if (pins.isEmpty()) return baseClient

        val pinner = CertificatePinner.Builder().apply {
            pins.forEach { pin ->
                add(SERVER_HOST, if (pin.startsWith("sha256/")) pin else "sha256/$pin")
            }
        }.build()
        return baseClient.newBuilder().certificatePinner(pinner).build()
    }

    private class InstrumentedEventListener(
        private val trackerRef: AtomicReference<CanaryPhaseTracker>,
        private val peerAddressRef: AtomicReference<InetAddress?>
    ) : EventListener() {
        private val tracker = CanaryPhaseTracker().also { trackerRef.set(it) }

        override fun dnsStart(call: Call, domainName: String) {
            tracker.dnsStart()
        }

        override fun dnsEnd(call: Call, domainName: String, inetAddressList: List<InetAddress>) {
            tracker.dnsEnd()
        }

        override fun connectStart(call: Call, inetSocketAddress: InetSocketAddress, proxy: Proxy) {
            peerAddressRef.set(inetSocketAddress.address)
            tracker.tcpStart()
        }

        override fun secureConnectStart(call: Call) {
            tracker.tcpEnd()
            tracker.tlsStart()
        }

        override fun secureConnectEnd(call: Call, handshake: Handshake?) {
            tracker.tlsEnd()
        }

        override fun connectEnd(
            call: Call,
            inetSocketAddress: InetSocketAddress,
            proxy: Proxy,
            protocol: Protocol?
        ) {
            tracker.tcpEnd()
        }

        override fun requestHeadersStart(call: Call) {
            tracker.httpStart()
        }

        override fun responseHeadersEnd(call: Call, response: Response) {
            tracker.httpEnd()
        }

        override fun callFailed(call: Call, ioe: IOException) {
            tracker.fail()
        }
    }

    companion object {
        const val SERVER_HOST = "vmi3376157.contaboserver.net"
        const val SERVER_HTTP_URL = "https://vmi3376157.contaboserver.net/hearth-canary/"
        const val SERVER_WS_URL = "wss://vmi3376157.contaboserver.net/hearth-canary/"
        private const val CONTROL_DNS_TARGET = "turkmenportal.com"
        private val CONTROL_HTTP_TARGETS = listOf(
            "www.apple.com",
            "www.microsoft.com",
            "yandex.ru",
            "www.gismeteo.ru",
            "www.cloudflare.com"
        )
    }
}

data class CanaryLightRun(
    val results: List<CanaryTestResult>,
    val traffic: CanaryTrafficSample?
)

internal object CanaryHttpCallPolicy {
    fun request(testType: String, url: String, deviceLabel: String = CanaryCorrelation.UNKNOWN_DEVICE_LABEL): Request {
        val builder = Request.Builder().url(url).get()
            .header(CanaryCorrelation.DEVICE_LABEL_HEADER, CanaryCorrelation.safeDeviceLabel(deviceLabel))
        if (testType == "http_domain") {
            builder.header("Connection", "close")
        }
        return builder.build()
    }

    fun controlClient(baseClient: OkHttpClient): OkHttpClient =
        baseClient.newBuilder()
            .protocols(listOf(Protocol.HTTP_1_1))
            .build()

    fun freshServerClient(baseClient: OkHttpClient): OkHttpClient =
        baseClient.newBuilder()
            .connectionPool(freshConnectionPool())
            .build()

    fun isSuccessfulResponse(testType: String, httpStatus: Int): Boolean =
        if (testType == "control_http") true else httpStatus in 200..399

    fun freshConnectionPool(): ConnectionPool =
        ConnectionPool(FRESH_SERVER_MAX_IDLE_CONNECTIONS, 1, TimeUnit.NANOSECONDS)

    const val FRESH_SERVER_MAX_IDLE_CONNECTIONS = 0
}

internal object CanaryCorrelation {
    const val DEVICE_LABEL_HEADER = "X-Canary-Device-Label"
    const val CONNECTION_ID_HEADER = "X-Canary-Connection-Id"
    const val UNKNOWN_DEVICE_LABEL = "unknown"
    private const val MAX_HEADER_LENGTH = 64
    private val printable = Regex("^[\\x20-\\x7e]{1,64}$")

    fun deviceLabel(context: Context): String =
        runCatching { CanaryDeviceLabelStore.get(context.applicationContext) }
            .getOrDefault(UNKNOWN_DEVICE_LABEL)
            .let(::safeDeviceLabel)

    fun safeDeviceLabel(value: String?): String {
        val trimmed = value?.trim().orEmpty()
        return if (trimmed.length <= MAX_HEADER_LENGTH && printable.matches(trimmed)) {
            trimmed
        } else {
            UNKNOWN_DEVICE_LABEL
        }
    }

    fun websocketRequest(url: String, deviceLabel: String, connectionId: String): Request =
        Request.Builder()
            .url(url)
            .header(DEVICE_LABEL_HEADER, safeDeviceLabel(deviceLabel))
            .header(CONNECTION_ID_HEADER, connectionId)
            .build()

    fun newConnectionId(): String = UUID.randomUUID().toString()

    fun keepaliveResultConnectionId(currentConnectionId: String?): String =
        currentConnectionId ?: newConnectionId()
}

object CanaryLightRunThreadGuard {
    fun assertNotMainThread(
        currentThread: Thread = Thread.currentThread(),
        mainThread: Thread? = androidMainThread()
    ) {
        check(mainThread == null || currentThread !== mainThread) {
            "Canary light run must not execute on Android main thread."
        }
    }

    private fun androidMainThread(): Thread? =
        runCatching { Looper.getMainLooper().thread }.getOrNull()
}

data class CanaryTrafficSample(
    val bytesTx: Long?,
    val bytesRx: Long?
)

object CanaryTrafficDeltaCalculator {
    fun delta(before: CanaryTrafficSample, after: CanaryTrafficSample): CanaryTrafficSample? {
        val tx = nonNegativeDelta(before.bytesTx, after.bytesTx)
        val rx = nonNegativeDelta(before.bytesRx, after.bytesRx)
        return if (tx == null && rx == null) null else CanaryTrafficSample(tx, rx)
    }

    private fun nonNegativeDelta(before: Long?, after: Long?): Long? {
        if (before == null || after == null) return null
        val delta = after - before
        return if (delta >= 0L) delta else null
    }
}

private object CanaryTrafficSampler {
    fun sample(): CanaryTrafficSample =
        runCatching {
            val uid = Process.myUid()
            CanaryTrafficSample(
                bytesTx = TrafficStats.getUidTxBytes(uid).takeIfAvailable(),
                bytesRx = TrafficStats.getUidRxBytes(uid).takeIfAvailable()
            )
        }.getOrDefault(CanaryTrafficSample(bytesTx = null, bytesRx = null))

    private fun Long.takeIfAvailable(): Long? =
        takeIf { it >= 0L }
}
