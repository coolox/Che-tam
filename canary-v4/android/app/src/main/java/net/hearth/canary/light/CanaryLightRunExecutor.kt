package net.hearth.canary.light

import android.content.Context
import net.hearth.canary.BuildConfig
import okhttp3.Call
import okhttp3.CertificatePinner
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
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class CanaryLightRunExecutor(
    context: Context,
    private val webSocketKeeper: CanaryWebSocketKeeper = CanaryWebSocketKeeper.shared(context)
) {
    private val appContext = context.applicationContext
    private val dnsState = CanaryDnsState(appContext)
    private val baseClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .callTimeout(12, TimeUnit.SECONDS)
        .build()

    fun run(): List<CanaryTestResult> {
        val results = mutableListOf<CanaryTestResult>()
        CONTROL_HTTP_TARGETS.forEach { target ->
            results += executeHttp("control_http", target, "https://$target/", "HEAD", baseClient)
        }
        results += resolveDns("control_dns", CONTROL_DNS_TARGET)
        results += resolveDns("dns_resolve", SERVER_HOST)
        results += executeHttp("http_domain", SERVER_HOST, SERVER_HTTP_URL, "GET", pinnedClient())
        results += webSocketKeeper.checkKeepalive()
        return results
    }

    private fun executeHttp(
        testType: String,
        target: String,
        url: String,
        method: String,
        client: OkHttpClient
    ): CanaryTestResult {
        val startedAt = System.currentTimeMillis()
        val trackerRef = AtomicReference<CanaryPhaseTracker>()
        val peerAddressRef = AtomicReference<InetAddress?>()
        val instrumented = client.newBuilder()
            .eventListenerFactory { InstrumentedEventListener(trackerRef, peerAddressRef) }
            .build()
        val requestBuilder = Request.Builder().url(url)
        val request = if (method == "HEAD") requestBuilder.head().build() else requestBuilder.get().build()

        return try {
            instrumented.newCall(request).execute().use { response ->
                val phases = trackerRef.get()?.snapshot() ?: CanaryPhases()
                val success = response.code in 200..399
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
