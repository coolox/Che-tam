package net.hearth.canary.full

import android.content.Context
import android.net.ConnectivityManager
import android.net.DnsResolver
import android.net.Network
import android.os.Build
import android.os.CancellationSignal
import net.hearth.canary.light.CanaryErrorCategory
import net.hearth.canary.light.CanaryTestResult
import java.io.InterruptedIOException
import java.io.ByteArrayOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.SNIHostName
import javax.net.ssl.SNIServerName
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLHandshakeException
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

data class CanaryServiceTarget(
    val service: String,
    val host: String,
    val port: Int = 443,
    val protocol: String = "tls",
    val sniHost: String? = host,
    val mode: CanaryServiceReachMode = CanaryServiceReachMode.TLS
) {
    val target: String = "$host:$port"
}

enum class CanaryServiceReachMode(val wireValue: String) {
    TLS("tls"),
    TLS_ANY_CERT("tls_any_cert"),
    TCP("tcp"),
    UDP_STUN("udp_stun")
}

interface CanaryServiceReachTransport {
    fun tlsHandshake(host: String, port: Int, sniHost: String?, timeoutMs: Int): CanaryTlsReachTiming
    fun tlsHandshakeAnyCert(host: String, port: Int, sniHost: String?, timeoutMs: Int): CanaryTlsReachTiming =
        tlsHandshake(host, port, sniHost, timeoutMs)
    fun tcpConnect(host: String, port: Int, timeoutMs: Int): Long =
        tlsHandshake(host, port, host, timeoutMs).tcpMs
    fun stunBinding(host: String, port: Int, request: ByteArray, transactionId: ByteArray, timeoutMs: Int): Long
}

data class CanaryTlsReachTiming(
    val tcpMs: Long,
    val tlsMs: Long,
    val certTrusted: Boolean = true
)

class CanaryServiceReachExecutor(
    private val clock: () -> Long = System::currentTimeMillis,
    private val transport: CanaryServiceReachTransport = SocketCanaryServiceReachTransport(),
    private val timeoutMs: Int = 10_000
) {
    fun runServiceReach(): List<CanaryTestResult> =
        guarded {
            serviceReachResults()
        }

    fun runApnsReach(): List<CanaryTestResult> =
        guarded {
            apnsReachResults()
        }

    fun runFullRunReach(includeServiceReach: Boolean): List<CanaryTestResult> =
        guarded {
            apnsReachResults() + if (includeServiceReach) serviceReachResults() else emptyList()
        }

    private fun guarded(block: () -> List<CanaryTestResult>): List<CanaryTestResult> =
        if (!running.compareAndSet(false, true)) {
            emptyList()
        } else {
            try {
                block()
            } finally {
                running.set(false)
            }
        }

    private fun serviceReachResults(): List<CanaryTestResult> =
        CanaryServiceReachCatalog.targets.map { target -> reachResult("service_reach", target) } +
            CanaryServiceReachCatalog.stunTargets.map { target -> stunResult(target) }

    private fun apnsReachResults(): List<CanaryTestResult> =
        CanaryServiceReachCatalog.apnsTargets.map { target -> reachResult("apns_reach", target) }

    private fun reachResult(testType: String, target: CanaryServiceTarget): CanaryTestResult =
        when (target.mode) {
            CanaryServiceReachMode.TLS, CanaryServiceReachMode.TLS_ANY_CERT -> tlsResult(testType, target)
            CanaryServiceReachMode.TCP -> tcpResult(testType, target)
            CanaryServiceReachMode.UDP_STUN -> stunResult(target)
        }

    private fun tlsResult(testType: String, target: CanaryServiceTarget): CanaryTestResult {
        val startedAt = clock()
        return try {
            val timing = if (target.mode == CanaryServiceReachMode.TLS_ANY_CERT) {
                transport.tlsHandshakeAnyCert(target.host, target.port, target.sniHost, timeoutMs)
            } else {
                transport.tlsHandshake(target.host, target.port, target.sniHost, timeoutMs)
            }
            CanaryTestResult(
                testType = testType,
                target = target.target,
                success = true,
                errorCategory = CanaryErrorCategory.NONE,
                service = target.service,
                host = target.host,
                port = target.port,
                protocol = target.protocol,
                mode = target.mode.wireValue,
                latencyMs = clock() - startedAt,
                tcpMs = timing.tcpMs,
                tlsMs = timing.tlsMs,
                certTrusted = timing.certTrusted
            )
        } catch (throwable: Throwable) {
            CanaryTestResult(
                testType = testType,
                target = target.target,
                success = false,
                errorCategory = CanaryServiceReachErrors.category(throwable),
                errorDetail = CanarySecretScrubber.safeError(throwable.message),
                exceptionClass = throwable.javaClass.name,
                service = target.service,
                host = target.host,
                port = target.port,
                protocol = target.protocol,
                mode = target.mode.wireValue,
                latencyMs = clock() - startedAt
            )
        }
    }

    private fun tcpResult(testType: String, target: CanaryServiceTarget): CanaryTestResult {
        val startedAt = clock()
        return try {
            val tcpMs = transport.tcpConnect(target.host, target.port, timeoutMs)
            CanaryTestResult(
                testType = testType,
                target = target.target,
                success = true,
                errorCategory = CanaryErrorCategory.NONE,
                service = target.service,
                host = target.host,
                port = target.port,
                protocol = target.protocol,
                mode = target.mode.wireValue,
                latencyMs = clock() - startedAt,
                tcpMs = tcpMs
            )
        } catch (throwable: Throwable) {
            CanaryTestResult(
                testType = testType,
                target = target.target,
                success = false,
                errorCategory = CanaryServiceReachErrors.category(throwable),
                errorDetail = CanarySecretScrubber.safeError(throwable.message),
                exceptionClass = throwable.javaClass.name,
                service = target.service,
                host = target.host,
                port = target.port,
                protocol = target.protocol,
                mode = target.mode.wireValue,
                latencyMs = clock() - startedAt
            )
        }
    }

    private fun stunResult(target: CanaryServiceTarget): CanaryTestResult {
        val startedAt = clock()
        val request = CanaryStunMessage.bindingRequest()
        return try {
            val udpMs = transport.stunBinding(target.host, target.port, request.bytes, request.transactionId, timeoutMs)
            CanaryTestResult(
                testType = "service_reach",
                target = target.target,
                success = true,
                errorCategory = CanaryErrorCategory.NONE,
                service = target.service,
                host = target.host,
                port = target.port,
                protocol = target.protocol,
                mode = target.mode.wireValue,
                latencyMs = clock() - startedAt,
                udpMs = udpMs
            )
        } catch (throwable: Throwable) {
            CanaryTestResult(
                testType = "service_reach",
                target = target.target,
                success = false,
                errorCategory = CanaryServiceReachErrors.udpCategory(throwable),
                errorDetail = CanarySecretScrubber.safeError(throwable.message),
                exceptionClass = throwable.javaClass.name,
                service = target.service,
                host = target.host,
                port = target.port,
                protocol = target.protocol,
                mode = target.mode.wireValue,
                latencyMs = clock() - startedAt
            )
        }
    }

    companion object {
        private val running = AtomicBoolean(false)
    }
}

object CanaryServiceReachDeadline {
    fun remainingMs(startedAtMs: Long, nowMs: Long, timeoutMs: Int): Int {
        val elapsed = (nowMs - startedAtMs).coerceAtLeast(0L)
        val remaining = timeoutMs.toLong() - elapsed
        return remaining.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    }
}

object CanaryServiceReachCatalog {
    val googleTargets = listOf(
        CanaryServiceTarget("google", "www.google.com"),
        CanaryServiceTarget("google", "play.google.com"),
        CanaryServiceTarget("google", "play.googleapis.com"),
        CanaryServiceTarget("google", "mtalk.google.com", 5228),
        CanaryServiceTarget("google", "fcm.googleapis.com"),
        CanaryServiceTarget("google", "firebaseinstallations.googleapis.com"),
        CanaryServiceTarget("google", "www.gstatic.com"),
        CanaryServiceTarget("google", "www.youtube.com")
    )
    val appleTargets = listOf(
        CanaryServiceTarget("apple", "apps.apple.com"),
        CanaryServiceTarget("apple", "www.icloud.com"),
        CanaryServiceTarget("apple", "1-courier.push.apple.com", 5223, mode = CanaryServiceReachMode.TLS_ANY_CERT),
        CanaryServiceTarget("apple", "1-courier.push.apple.com", 443, mode = CanaryServiceReachMode.TLS_ANY_CERT)
    )
    val messengerTargets = listOf(
        CanaryServiceTarget("messenger", "imo.im"),
        CanaryServiceTarget("messenger", "web.telegram.org"),
        CanaryServiceTarget("messenger", "api.telegram.org"),
        CanaryServiceTarget("messenger", "149.154.167.50", 443, sniHost = null),
        CanaryServiceTarget("messenger", "web.whatsapp.com"),
        CanaryServiceTarget("messenger", "g.whatsapp.net", 443, "tcp", mode = CanaryServiceReachMode.TCP),
        CanaryServiceTarget("messenger", "g.whatsapp.net", 5222, "tcp", mode = CanaryServiceReachMode.TCP),
        CanaryServiceTarget("messenger", "www.viber.com"),
        CanaryServiceTarget("messenger", "chat.signal.org", mode = CanaryServiceReachMode.TLS_ANY_CERT),
        CanaryServiceTarget("messenger", "zoom.us"),
        CanaryServiceTarget("messenger", "teams.microsoft.com")
    )
    val cloudTargets = listOf(
        CanaryServiceTarget("cloud", "s3.amazonaws.com"),
        CanaryServiceTarget("cloud", "storage.googleapis.com"),
        CanaryServiceTarget("cloud", "www.cloudflare.com"),
        CanaryServiceTarget("cloud", "azure.microsoft.com"),
        CanaryServiceTarget("cloud", "www.hetzner.com"),
        CanaryServiceTarget("cloud", "www.digitalocean.com")
    )
    val otherTargets = listOf(
        CanaryServiceTarget("other", "www.instagram.com"),
        CanaryServiceTarget("other", "www.tiktok.com"),
        CanaryServiceTarget("other", "vk.com"),
        CanaryServiceTarget("other", "ok.ru"),
        CanaryServiceTarget("other", "mail.ru")
    )
    val targets = googleTargets + appleTargets + messengerTargets + cloudTargets + otherTargets
    val stunTargets = listOf(
        CanaryServiceTarget("stun", "stun.l.google.com", 19302, "udp_stun", mode = CanaryServiceReachMode.UDP_STUN),
        CanaryServiceTarget("stun", "stun.cloudflare.com", 3478, "udp_stun", mode = CanaryServiceReachMode.UDP_STUN)
    )
    val apnsTargets = listOf(
        CanaryServiceTarget("apns", "1-courier.push.apple.com", 5223, mode = CanaryServiceReachMode.TLS_ANY_CERT),
        CanaryServiceTarget("apns", "1-courier.push.apple.com", 443, mode = CanaryServiceReachMode.TLS_ANY_CERT),
        CanaryServiceTarget("apns", "api.push.apple.com", 443)
    )
}

object CanaryServiceReachDailyPlanner {
    fun shouldRun(nowMs: Long, lastUtcDay: String?): Boolean {
        val day = java.time.Instant.ofEpochMilli(nowMs).atZone(java.time.ZoneOffset.UTC).toLocalDate().toString()
        return day != lastUtcDay
    }

    fun utcDay(nowMs: Long): String =
        java.time.Instant.ofEpochMilli(nowMs).atZone(java.time.ZoneOffset.UTC).toLocalDate().toString()
}

object CanaryServiceReachErrors {
    fun category(throwable: Throwable): CanaryErrorCategory =
        when (throwable) {
            is CanaryServiceReachDnsTimeoutException -> CanaryErrorCategory.DNS_TIMEOUT
            is CanaryServiceReachDnsException, is UnknownHostException -> CanaryErrorCategory.DNS_NXDOMAIN
            is SocketTimeoutException, is InterruptedIOException -> CanaryErrorCategory.TCP_TIMEOUT
            is javax.net.ssl.SSLException -> CanaryErrorCategory.TLS_HANDSHAKE_ERROR
            else -> CanaryErrorCategory.OTHER
        }

    fun udpCategory(throwable: Throwable): CanaryErrorCategory =
        when (throwable) {
            is SocketTimeoutException, is InterruptedIOException -> CanaryErrorCategory.UDP_TIMEOUT
            else -> CanaryErrorCategory.UDP_ERROR
        }
}

internal class CanaryServiceReachDnsTimeoutException(message: String) : SocketTimeoutException(message)
internal class CanaryServiceReachDnsException(message: String) : UnknownHostException(message)

data class CanaryStunRequest(val bytes: ByteArray, val transactionId: ByteArray)

object CanaryStunMessage {
    private const val BINDING_REQUEST = 0x0001
    private const val BINDING_SUCCESS = 0x0101
    private const val MAGIC_COOKIE = 0x2112A442
    private val random = SecureRandom()

    fun bindingRequest(transactionId: ByteArray = ByteArray(12).also(random::nextBytes)): CanaryStunRequest {
        require(transactionId.size == 12) { "STUN transaction ID must be 12 bytes." }
        val bytes = ByteArray(20)
        writeU16(bytes, 0, BINDING_REQUEST)
        writeU16(bytes, 2, 0)
        writeU32(bytes, 4, MAGIC_COOKIE)
        transactionId.copyInto(bytes, 8)
        return CanaryStunRequest(bytes, transactionId)
    }

    fun isBindingSuccess(response: ByteArray, transactionId: ByteArray): Boolean =
        response.size >= 20 &&
            u16(response, 0) == BINDING_SUCCESS &&
            u32(response, 4) == MAGIC_COOKIE &&
            response.copyOfRange(8, 20).contentEquals(transactionId)

    private fun u16(bytes: ByteArray, offset: Int): Int =
        ((bytes[offset].toInt() and 0xff) shl 8) or (bytes[offset + 1].toInt() and 0xff)

    private fun u32(bytes: ByteArray, offset: Int): Int =
        (u16(bytes, offset) shl 16) or u16(bytes, offset + 2)

    private fun writeU16(bytes: ByteArray, offset: Int, value: Int) {
        bytes[offset] = ((value ushr 8) and 0xff).toByte()
        bytes[offset + 1] = (value and 0xff).toByte()
    }

    private fun writeU32(bytes: ByteArray, offset: Int, value: Int) {
        writeU16(bytes, offset, value ushr 16)
        writeU16(bytes, offset + 2, value)
    }
}

class SocketCanaryServiceReachTransport internal constructor(
    private val clock: () -> Long = { System.nanoTime() / 1_000_000L },
    private val operations: CanaryTlsProbeOperations = JvmCanaryTlsProbeOperations()
) : CanaryServiceReachTransport {
    constructor(
        context: Context,
        clock: () -> Long = { System.nanoTime() / 1_000_000L }
    ) : this(clock, JvmCanaryTlsProbeOperations(context.applicationContext))

    override fun tlsHandshake(host: String, port: Int, sniHost: String?, timeoutMs: Int): CanaryTlsReachTiming {
        return tlsHandshakeWithTrust(
            host,
            port,
            sniHost,
            timeoutMs,
            deadlineStarted = clock(),
            trustMode = CanaryTlsTrustMode.NORMAL,
            certTrusted = true
        )
    }

    override fun tlsHandshakeAnyCert(host: String, port: Int, sniHost: String?, timeoutMs: Int): CanaryTlsReachTiming {
        val deadlineStarted = clock()
        return try {
            tlsHandshakeWithTrust(
                host,
                port,
                sniHost,
                timeoutMs,
                deadlineStarted,
                CanaryTlsTrustMode.NORMAL,
                certTrusted = true
            )
        } catch (throwable: SSLHandshakeException) {
            tlsHandshakeWithTrust(
                host,
                port,
                sniHost,
                timeoutMs,
                deadlineStarted,
                CanaryTlsTrustMode.ANY_CERT,
                certTrusted = false
            )
        }
    }

    override fun tcpConnect(host: String, port: Int, timeoutMs: Int): Long {
        val deadlineStarted = clock()
        val address = resolveTarget(host, port, deadlineStarted, timeoutMs)
        operations.openSocket().use { plain ->
            val tcpStarted = clock()
            val connectBudgetMs = remainingBudget(deadlineStarted, timeoutMs, "TCP")
            plain.soTimeout = connectBudgetMs
            operations.connect(plain, address, connectBudgetMs)
            return clock() - tcpStarted
        }
    }

    private fun tlsHandshakeWithTrust(
        host: String,
        port: Int,
        sniHost: String?,
        timeoutMs: Int,
        deadlineStarted: Long,
        trustMode: CanaryTlsTrustMode,
        certTrusted: Boolean
    ): CanaryTlsReachTiming {
        val address = resolveTarget(host, port, deadlineStarted, timeoutMs)
        operations.openSocket().use { plain ->
            val tcpStarted = clock()
            val connectBudgetMs = remainingBudget(deadlineStarted, timeoutMs, "TCP")
            plain.soTimeout = connectBudgetMs
            operations.connect(plain, address, connectBudgetMs)
            val tcpMs = clock() - tcpStarted
            val tlsStarted = clock()
            operations.handshake(
                plain,
                host,
                port,
                sniHost,
                remainingBudget(deadlineStarted, timeoutMs, "TLS"),
                trustMode
            )
            if (CanaryServiceReachDeadline.remainingMs(deadlineStarted, clock(), timeoutMs) < 0) {
                throw SocketTimeoutException("service reach TLS budget exhausted")
            }
            return CanaryTlsReachTiming(tcpMs = tcpMs, tlsMs = clock() - tlsStarted, certTrusted = certTrusted)
        }
    }

    private fun resolveTarget(host: String, port: Int, deadlineStarted: Long, timeoutMs: Int): InetSocketAddress {
        CanaryLiteralIpAddress.parse(host)?.let { return InetSocketAddress(it, port) }
        val addresses = operations.resolve(host, port, remainingBudget(deadlineStarted, timeoutMs, "DNS"))
        return addresses.firstOrNull()
            ?: throw CanaryServiceReachDnsException("service reach DNS returned no addresses")
    }

    private fun remainingBudget(deadlineStarted: Long, timeoutMs: Int, phase: String): Int {
        val remainingMs = CanaryServiceReachDeadline.remainingMs(deadlineStarted, clock(), timeoutMs)
        if (remainingMs <= 0) {
            throw SocketTimeoutException("service reach $phase budget exhausted")
        }
        return remainingMs
    }

    override fun stunBinding(host: String, port: Int, request: ByteArray, transactionId: ByteArray, timeoutMs: Int): Long {
        DatagramSocket().use { socket ->
            socket.soTimeout = timeoutMs
            val started = clock()
            socket.send(DatagramPacket(request, request.size, InetSocketAddress(host, port)))
            val response = ByteArray(512)
            val packet = DatagramPacket(response, response.size)
            socket.receive(packet)
            check(CanaryStunMessage.isBindingSuccess(response.copyOf(packet.length), transactionId)) {
                "STUN binding response mismatch"
            }
            return clock() - started
        }
    }
}

internal interface CanaryTlsProbeOperations {
    fun resolve(host: String, port: Int, timeoutMs: Int): List<InetSocketAddress>
    fun openSocket(): Socket = Socket()
    fun connect(socket: Socket, address: InetSocketAddress, timeoutMs: Int)
    fun handshake(socket: Socket, host: String, port: Int, sniHost: String?, timeoutMs: Int)
    fun handshake(
        socket: Socket,
        host: String,
        port: Int,
        sniHost: String?,
        timeoutMs: Int,
        trustMode: CanaryTlsTrustMode = CanaryTlsTrustMode.NORMAL
    ) = handshake(socket, host, port, sniHost, timeoutMs)
}

internal enum class CanaryTlsTrustMode {
    NORMAL,
    ANY_CERT
}

internal class JvmCanaryTlsProbeOperations(
    context: Context? = null,
    private val dnsResolver: CanaryDnsProbeResolver = CanaryCancellableDnsProbeResolver(
        systemResolver = context?.let { AndroidCanarySystemDnsResolver(it) }
    )
) : CanaryTlsProbeOperations {
    override fun resolve(host: String, port: Int, timeoutMs: Int): List<InetSocketAddress> =
        dnsResolver.resolve(host, port, timeoutMs)

    override fun connect(socket: Socket, address: InetSocketAddress, timeoutMs: Int) {
        socket.connect(address, timeoutMs)
    }

    override fun handshake(socket: Socket, host: String, port: Int, sniHost: String?, timeoutMs: Int) {
        handshake(socket, host, port, sniHost, timeoutMs, CanaryTlsTrustMode.NORMAL)
    }

    override fun handshake(
        socket: Socket,
        host: String,
        port: Int,
        sniHost: String?,
        timeoutMs: Int,
        trustMode: CanaryTlsTrustMode
    ) {
        val sslSocketFactory = when (trustMode) {
            CanaryTlsTrustMode.NORMAL -> SSLSocketFactory.getDefault() as SSLSocketFactory
            CanaryTlsTrustMode.ANY_CERT -> CanaryAnyCertSslSocketFactory.get()
        }
        (sslSocketFactory.createSocket(socket, sniHost ?: host, port, true) as SSLSocket).use { ssl ->
            ssl.soTimeout = timeoutMs
            ssl.sslParameters = ssl.sslParameters.apply {
                serverNames = sniHost?.let { listOf<SNIServerName>(SNIHostName(it)) } ?: emptyList()
            }
            CanaryBoundedProbeRunner.run("TLS", timeoutMs, closeOnTimeout = { ssl.close() }) {
                ssl.startHandshake()
            }
        }
    }
}

internal object CanaryAnyCertSslSocketFactory {
    private val trustAll = object : X509TrustManager {
        override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) = Unit
        override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) = Unit
        override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    }

    private val socketFactory: SSLSocketFactory by lazy {
        SSLContext.getInstance("TLS").apply {
            init(null, arrayOf<TrustManager>(trustAll), SecureRandom())
        }.socketFactory
    }

    fun get(): SSLSocketFactory = socketFactory
}

internal object CanaryLiteralIpAddress {
    private val ipv4 = Regex("""\d{1,3}(\.\d{1,3}){3}""")
    private val ipv6 = Regex("""[0-9a-fA-F:]+""")

    fun parse(host: String): InetAddress? {
        val normalized = host.trim().removePrefix("[").removeSuffix("]")
        val literal = ipv4.matches(normalized) || (normalized.contains(":") && ipv6.matches(normalized))
        if (!literal) return null
        return runCatching { InetAddress.getByName(normalized) }.getOrNull()
    }
}

internal interface CanaryDnsProbeResolver {
    fun resolve(host: String, port: Int, timeoutMs: Int): List<InetSocketAddress>
}

internal data class CanarySystemDnsConfig(
    val servers: List<InetAddress>,
    val bindSocket: (DatagramSocket) -> Unit = {}
)

internal interface CanarySystemDnsServerProvider {
    fun current(): CanarySystemDnsConfig?
}

internal interface CanarySystemDnsUdpClient {
    fun exchange(server: InetAddress, request: ByteArray, timeoutMs: Int, bindSocket: (DatagramSocket) -> Unit): ByteArray
}

internal interface CanaryDnsDatagramSocket : AutoCloseable {
    var soTimeout: Int
    fun send(packet: DatagramPacket)
    fun receive(packet: DatagramPacket)
}

internal interface CanaryDnsDatagramSocketFactory {
    fun open(bindSocket: (DatagramSocket) -> Unit): CanaryDnsDatagramSocket
}

internal open class CanarySystemDnsResolver(
    private val provider: CanarySystemDnsServerProvider,
    private val udpClient: CanarySystemDnsUdpClient = DatagramCanarySystemDnsUdpClient(),
    private val nowMs: () -> Long = { System.nanoTime() / 1_000_000L },
    private val nextId: () -> Int = { SecureRandom().nextInt() }
) : CanaryDnsProbeResolver {
    override fun resolve(host: String, port: Int, timeoutMs: Int): List<InetSocketAddress> {
        val deadlineAt = nowMs() + timeoutMs
        val config = provider.current()
            ?: throw CanaryServiceReachDnsException("service reach DNS no active network")
        if (config.servers.isEmpty()) {
            throw CanaryServiceReachDnsException("service reach DNS no active servers")
        }

        for (server in config.servers) {
            for (type in listOf(CanaryRawDnsMessage.TYPE_A, CanaryRawDnsMessage.TYPE_AAAA)) {
                val id = nextId() and 0xffff
                val request = CanaryRawDnsMessage.query(host, type, id)
                try {
                    val response = udpClient.exchange(server, request, remaining(deadlineAt), config.bindSocket)
                    val answers = CanaryRawDnsMessage.parseAddresses(response, host, type, id)
                        .filterNot(net.hearth.canary.light.CanaryAddressClassifier::isInvalidCanaryAddress)
                    if (answers.isNotEmpty()) {
                        return answers.map { InetSocketAddress(it, port) }
                    }
                } catch (timeout: CanaryServiceReachDnsTimeoutException) {
                    throw timeout
                } catch (_: SocketTimeoutException) {
                    if (nowMs() >= deadlineAt) {
                        throw CanaryServiceReachDnsTimeoutException("service reach DNS budget exhausted")
                    }
                } catch (_: CanaryServiceReachDnsException) {
                    // Malformed, mismatched or negative replies are ignored; try the next query/server.
                } catch (_: java.io.IOException) {
                    // Unusable server; try the next query/server while the shared deadline remains.
                }
            }
        }
        remaining(deadlineAt)
        throw CanaryServiceReachDnsException("service reach DNS returned no usable answers")
    }

    private fun remaining(deadlineAt: Long): Int {
        val remaining = deadlineAt - nowMs()
        if (remaining <= 0) {
            throw CanaryServiceReachDnsTimeoutException("service reach DNS budget exhausted")
        }
        return remaining.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    }
}

private class AndroidCanarySystemDnsResolver(context: Context) : CanarySystemDnsResolver(
    provider = AndroidCanarySystemDnsServerProvider(context.applicationContext)
)

private class AndroidCanarySystemDnsServerProvider(context: Context) : CanarySystemDnsServerProvider {
    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    override fun current(): CanarySystemDnsConfig? {
        val network = connectivityManager.activeNetwork ?: return null
        val servers = connectivityManager.getLinkProperties(network)?.dnsServers.orEmpty()
        return CanarySystemDnsConfig(servers = servers) { socket ->
            network.bindSocket(socket)
        }
    }
}

internal class DatagramCanarySystemDnsUdpClient(
    private val socketFactory: CanaryDnsDatagramSocketFactory = JvmCanaryDnsDatagramSocketFactory()
) : CanarySystemDnsUdpClient {
    override fun exchange(
        server: InetAddress,
        request: ByteArray,
        timeoutMs: Int,
        bindSocket: (DatagramSocket) -> Unit
    ): ByteArray {
        if (timeoutMs <= 0) throw CanaryServiceReachDnsTimeoutException("service reach DNS budget exhausted")
        socketFactory.open(bindSocket).use { socket ->
            socket.soTimeout = timeoutMs
            socket.send(DatagramPacket(request, request.size, InetSocketAddress(server, 53)))
            val response = ByteArray(1232)
            val packet = DatagramPacket(response, response.size)
            socket.receive(packet)
            return response.copyOf(packet.length)
        }
    }
}

internal class JvmCanaryDnsDatagramSocketFactory(
    private val createSocket: () -> DatagramSocket = { DatagramSocket() }
) : CanaryDnsDatagramSocketFactory {
    override fun open(bindSocket: (DatagramSocket) -> Unit): CanaryDnsDatagramSocket {
        val socket = createSocket()
        var bound = false
        try {
            bindSocket(socket)
            bound = true
        } catch (throwable: Throwable) {
            throw throwable
        } finally {
            if (!bound) {
                socket.close()
            }
        }
        return object : CanaryDnsDatagramSocket {
            override var soTimeout: Int
                get() = socket.soTimeout
                set(value) {
                    socket.soTimeout = value
                }

            override fun send(packet: DatagramPacket) {
                socket.send(packet)
            }

            override fun receive(packet: DatagramPacket) {
                socket.receive(packet)
            }

            override fun close() {
                socket.close()
            }
        }
    }
}

internal object CanaryRawDnsMessage {
    const val TYPE_A = 1
    const val TYPE_AAAA = 28
    private const val CLASS_IN = 1
    private const val FLAG_RESPONSE = 0x8000
    private const val FLAG_TRUNCATED = 0x0200

    fun query(host: String, type: Int, id: Int): ByteArray {
        val out = ByteArrayOutputStream()
        writeU16(out, id and 0xffff)
        writeU16(out, 0x0100)
        writeU16(out, 1)
        writeU16(out, 0)
        writeU16(out, 0)
        writeU16(out, 0)
        writeQuestionName(out, host)
        writeU16(out, type)
        writeU16(out, CLASS_IN)
        return out.toByteArray()
    }

    fun parseAddresses(message: ByteArray, host: String, type: Int, id: Int): List<InetAddress> {
        if (message.size < 12) throw CanaryServiceReachDnsException("service reach DNS malformed response")
        if (u16(message, 0) != (id and 0xffff)) throw CanaryServiceReachDnsException("service reach DNS txid mismatch")
        val flags = u16(message, 2)
        if ((flags and FLAG_RESPONSE) == 0) throw CanaryServiceReachDnsException("service reach DNS not a response")
        if ((flags and FLAG_TRUNCATED) != 0) throw CanaryServiceReachDnsException("service reach DNS truncated response")
        val rcode = flags and 0x000f
        if (rcode != 0) throw CanaryServiceReachDnsException("service reach DNS rcode $rcode")
        if (u16(message, 4) != 1) throw CanaryServiceReachDnsException("service reach DNS question mismatch")
        val answerCount = u16(message, 6)
        var offset = 12
        val question = readName(message, offset)
        offset = question.nextOffset
        val normalizedHost = host.trim('.')
        if (!question.name.equals(normalizedHost, ignoreCase = true)) {
            throw CanaryServiceReachDnsException("service reach DNS question mismatch")
        }
        if (offset + 4 > message.size) throw CanaryServiceReachDnsException("service reach DNS malformed question")
        if (u16(message, offset) != type || u16(message, offset + 2) != CLASS_IN) {
            throw CanaryServiceReachDnsException("service reach DNS question mismatch")
        }
        offset += 4

        val addresses = mutableListOf<InetAddress>()
        repeat(answerCount) {
            val name = readName(message, offset)
            offset = name.nextOffset
            if (offset + 10 > message.size) throw CanaryServiceReachDnsException("service reach DNS malformed answer")
            val answerType = u16(message, offset)
            val klass = u16(message, offset + 2)
            val size = u16(message, offset + 8)
            val dataOffset = offset + 10
            val dataEnd = dataOffset + size
            if (dataEnd > message.size) throw CanaryServiceReachDnsException("service reach DNS malformed answer")
            if (name.name.equals(normalizedHost, ignoreCase = true) &&
                klass == CLASS_IN &&
                ((answerType == TYPE_A && size == 4) || (answerType == TYPE_AAAA && size == 16))
            ) {
                addresses += InetAddress.getByAddress(message.copyOfRange(dataOffset, dataEnd))
            }
            offset = dataEnd
        }
        return addresses
    }

    private data class DnsName(val name: String, val nextOffset: Int)

    private fun readName(message: ByteArray, start: Int): DnsName {
        val labels = mutableListOf<String>()
        var offset = start
        var nextOffset = -1
        var jumps = 0
        while (offset < message.size) {
            val length = message[offset].toInt() and 0xff
            if (length == 0) {
                return DnsName(labels.joinToString("."), if (nextOffset >= 0) nextOffset else offset + 1)
            }
            if ((length and 0xC0) == 0xC0) {
                if (offset + 1 >= message.size || jumps++ > 8) {
                    throw CanaryServiceReachDnsException("service reach DNS malformed name")
                }
                if (nextOffset < 0) nextOffset = offset + 2
                offset = ((length and 0x3f) shl 8) or (message[offset + 1].toInt() and 0xff)
                continue
            }
            if ((length and 0xC0) != 0 || offset + 1 + length > message.size) {
                throw CanaryServiceReachDnsException("service reach DNS malformed name")
            }
            labels += String(message, offset + 1, length, Charsets.UTF_8)
            offset += 1 + length
        }
        throw CanaryServiceReachDnsException("service reach DNS malformed name")
    }

    private fun writeQuestionName(out: ByteArrayOutputStream, host: String) {
        host.trim('.').split('.').filter(String::isNotBlank).forEach { label ->
            require(label.length in 1..63) { "Invalid DNS label length." }
            val bytes = label.toByteArray(Charsets.UTF_8)
            out.write(bytes.size)
            out.write(bytes)
        }
        out.write(0)
    }

    private fun u16(bytes: ByteArray, offset: Int): Int =
        ((bytes[offset].toInt() and 0xff) shl 8) or (bytes[offset + 1].toInt() and 0xff)

    private fun writeU16(out: ByteArrayOutputStream, value: Int) {
        out.write((value ushr 8) and 0xff)
        out.write(value and 0xff)
    }
}

internal class CanaryCancellableDnsProbeResolver(
    private val apiLevel: () -> Int = { Build.VERSION.SDK_INT },
    private val cancellationFactory: CanaryDnsCancellationFactory = AndroidCanaryDnsCancellationFactory,
    private val query: CanaryAsyncDnsQuery? = null,
    private val systemResolver: CanaryDnsProbeResolver? = null,
    private val await: (CountDownLatch, Long) -> Boolean = { latch, timeoutMs ->
        latch.await(timeoutMs, TimeUnit.MILLISECONDS)
    }
) : CanaryDnsProbeResolver {
    override fun resolve(host: String, port: Int, timeoutMs: Int): List<InetSocketAddress> {
        if (timeoutMs <= 0) {
            throw CanaryServiceReachDnsTimeoutException("service reach DNS budget exhausted")
        }
        if (apiLevel() < Build.VERSION_CODES.Q) {
            return (systemResolver ?: throw CanaryServiceReachDnsException("service reach DNS fallback unavailable"))
                .resolve(host, port, timeoutMs)
        }

        val latch = CountDownLatch(1)
        val addresses = AtomicReference<List<InetAddress>?>(null)
        val failure = AtomicReference<Throwable?>(null)
        val cancellation = cancellationFactory.create()
        val activeQuery = query ?: AndroidCanaryAsyncDnsQuery

        activeQuery.query(
            host = host,
            cancellation = cancellation,
            callback = object : CanaryAsyncDnsCallback {
                override fun onAnswer(answer: List<InetAddress>) {
                    addresses.set(answer)
                    latch.countDown()
                }

                override fun onError(throwable: Throwable) {
                    failure.set(throwable)
                    latch.countDown()
                }
            }
        )

        if (!await(latch, timeoutMs.toLong())) {
            cancellation.cancel()
            throw CanaryServiceReachDnsTimeoutException("service reach DNS budget exhausted")
        }

        failure.get()?.let { throw it }
        return addresses.get().orEmpty().map { InetSocketAddress(it, port) }
    }
}

internal interface CanaryAsyncDnsCallback {
    fun onAnswer(answer: List<InetAddress>)
    fun onError(throwable: Throwable)
}

internal interface CanaryAsyncDnsQuery {
    fun query(host: String, cancellation: CanaryDnsCancellation, callback: CanaryAsyncDnsCallback)
}

internal interface CanaryDnsCancellation {
    fun cancel()
}

internal interface CanaryDnsCancellationFactory {
    fun create(): CanaryDnsCancellation
}

private object AndroidCanaryDnsCancellationFactory : CanaryDnsCancellationFactory {
    override fun create(): CanaryDnsCancellation = AndroidCanaryDnsCancellation(CancellationSignal())
}

private class AndroidCanaryDnsCancellation(val signal: CancellationSignal) : CanaryDnsCancellation {
    override fun cancel() {
        signal.cancel()
    }
}

private object AndroidCanaryAsyncDnsQuery : CanaryAsyncDnsQuery {
    private val directExecutor = java.util.concurrent.Executor { runnable -> runnable.run() }

    override fun query(host: String, cancellation: CanaryDnsCancellation, callback: CanaryAsyncDnsCallback) {
        val signal = (cancellation as AndroidCanaryDnsCancellation).signal
        DnsResolver.getInstance().query(
            null as Network?,
            host,
            DnsResolver.FLAG_EMPTY,
            directExecutor,
            signal,
            object : DnsResolver.Callback<List<InetAddress>> {
                override fun onAnswer(answer: List<InetAddress>, rcode: Int) {
                    if (rcode == 0) {
                        callback.onAnswer(answer)
                    } else {
                        callback.onError(UnknownHostException("DNS rcode $rcode"))
                    }
                }

                override fun onError(error: DnsResolver.DnsException) {
                    callback.onError(error)
                }
            }
        )
    }
}

private object CanaryBoundedProbeRunner {
    private val executor = Executors.newFixedThreadPool(4) { runnable ->
        Thread(runnable, "canary-service-reach-probe").apply { isDaemon = true }
    }

    fun <T> run(phase: String, timeoutMs: Int, closeOnTimeout: () -> Unit = {}, block: () -> T): T {
        if (timeoutMs <= 0) {
            throw SocketTimeoutException("service reach $phase budget exhausted")
        }
        val future = try {
            executor.submit<T> { block() }
        } catch (exception: RejectedExecutionException) {
            throw SocketTimeoutException("service reach $phase probe unavailable").apply {
                initCause(exception)
            }
        }
        try {
            return future.get(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
        } catch (exception: TimeoutException) {
            closeOnTimeout()
            future.cancel(true)
            throw SocketTimeoutException("service reach $phase budget exhausted").apply {
                initCause(exception)
            }
        } catch (exception: InterruptedException) {
            closeOnTimeout()
            future.cancel(true)
            Thread.currentThread().interrupt()
            throw InterruptedIOException("service reach $phase interrupted").apply {
                initCause(exception)
            }
        } catch (exception: java.util.concurrent.ExecutionException) {
            val cause = exception.cause ?: exception
            when (cause) {
                is RuntimeException -> throw cause
                is Error -> throw cause
                else -> throw cause
            }
        }
    }
}
