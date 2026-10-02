package net.hearth.canary.full

import net.hearth.canary.light.CanaryErrorCategory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Socket
import java.net.SocketTimeoutException
import java.io.ByteArrayOutputStream
import javax.net.ssl.SSLHandshakeException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class CanaryServiceReachTest {
    @Test
    fun serviceInventoryMatchesRequiredTargetsAndSniPolicy() {
        assertEquals(
            listOf(
                "www.google.com:443:tls:www.google.com:tls",
                "play.google.com:443:tls:play.google.com:tls",
                "play.googleapis.com:443:tls:play.googleapis.com:tls",
                "mtalk.google.com:5228:tls:mtalk.google.com:tls",
                "fcm.googleapis.com:443:tls:fcm.googleapis.com:tls",
                "firebaseinstallations.googleapis.com:443:tls:firebaseinstallations.googleapis.com:tls",
                "www.gstatic.com:443:tls:www.gstatic.com:tls",
                "www.youtube.com:443:tls:www.youtube.com:tls",
                "apps.apple.com:443:tls:apps.apple.com:tls",
                "www.icloud.com:443:tls:www.icloud.com:tls",
                "1-courier.push.apple.com:5223:tls:1-courier.push.apple.com:tls_any_cert",
                "1-courier.push.apple.com:443:tls:1-courier.push.apple.com:tls_any_cert",
                "imo.im:443:tls:imo.im:tls",
                "web.telegram.org:443:tls:web.telegram.org:tls",
                "api.telegram.org:443:tls:api.telegram.org:tls",
                "149.154.167.50:443:tls:null:tls",
                "web.whatsapp.com:443:tls:web.whatsapp.com:tls",
                "g.whatsapp.net:443:tcp:g.whatsapp.net:tcp",
                "g.whatsapp.net:5222:tcp:g.whatsapp.net:tcp",
                "www.viber.com:443:tls:www.viber.com:tls",
                "chat.signal.org:443:tls:chat.signal.org:tls_any_cert",
                "zoom.us:443:tls:zoom.us:tls",
                "teams.microsoft.com:443:tls:teams.microsoft.com:tls",
                "s3.amazonaws.com:443:tls:s3.amazonaws.com:tls",
                "storage.googleapis.com:443:tls:storage.googleapis.com:tls",
                "www.cloudflare.com:443:tls:www.cloudflare.com:tls",
                "azure.microsoft.com:443:tls:azure.microsoft.com:tls",
                "www.hetzner.com:443:tls:www.hetzner.com:tls",
                "www.digitalocean.com:443:tls:www.digitalocean.com:tls",
                "www.instagram.com:443:tls:www.instagram.com:tls",
                "www.tiktok.com:443:tls:www.tiktok.com:tls",
                "vk.com:443:tls:vk.com:tls",
                "ok.ru:443:tls:ok.ru:tls",
                "mail.ru:443:tls:mail.ru:tls"
            ),
            CanaryServiceReachCatalog.targets.map { "${it.host}:${it.port}:${it.protocol}:${it.sniHost}:${it.mode.wireValue}" }
        )
        assertNull(CanaryServiceReachCatalog.targets.single { it.host == "149.154.167.50" }.sniHost)
        assertEquals(listOf(5223, 443, 443), CanaryServiceReachCatalog.apnsTargets.map { it.port })
        assertEquals(listOf("tls_any_cert", "tls_any_cert", "tls"), CanaryServiceReachCatalog.apnsTargets.map { it.mode.wireValue })
        assertEquals(listOf("udp_stun", "udp_stun"), CanaryServiceReachCatalog.stunTargets.map { it.mode.wireValue })
    }

    @Test
    fun serviceReachSerializesTlsAndUdpResults() {
        var now = 1_000L
        val executor = CanaryServiceReachExecutor(
            clock = { now += 10; now },
            transport = object : CanaryServiceReachTransport {
                override fun tlsHandshake(host: String, port: Int, sniHost: String?, timeoutMs: Int): CanaryTlsReachTiming {
                    assertEquals(10_000, timeoutMs)
                    return CanaryTlsReachTiming(tcpMs = 11, tlsMs = 22)
                }

                override fun stunBinding(host: String, port: Int, request: ByteArray, transactionId: ByteArray, timeoutMs: Int): Long {
                    assertTrue(CanaryStunMessage.isBindingSuccess(stunSuccess(transactionId), transactionId))
                    return 33
                }
            }
        )

        val results = executor.runServiceReach()
        val tls = results.first { it.host == "www.google.com" }
        val stun = results.first { it.host == "stun.l.google.com" }

        assertEquals("service_reach", tls.testType)
        assertEquals("google", tls.service)
        assertEquals("tls", tls.protocol)
        assertEquals("tls", tls.mode)
        assertEquals(true, tls.certTrusted)
        assertEquals(11L, tls.tcpMs)
        assertEquals(22L, tls.tlsMs)
        assertEquals("service_reach", stun.testType)
        assertEquals("stun", stun.service)
        assertEquals("udp_stun", stun.protocol)
        assertEquals("udp_stun", stun.mode)
        assertEquals(33L, stun.udpMs)
        assertNull(stun.tcpMs)
    }

    @Test
    fun tlsAnyCertRetriesWithTrustDisabledAndReportsUntrustedCertificate() {
        val trustModes = mutableListOf<CanaryTlsTrustMode>()
        val transport = SocketCanaryServiceReachTransport(
            clock = { 1_000L + trustModes.size },
            operations = object : CanaryTlsProbeOperations {
                override fun resolve(host: String, port: Int, timeoutMs: Int): List<InetSocketAddress> =
                    listOf(loopback(port))

                override fun connect(socket: Socket, address: InetSocketAddress, timeoutMs: Int) = Unit

                override fun handshake(socket: Socket, host: String, port: Int, sniHost: String?, timeoutMs: Int) {
                    fail("trust mode must be explicit for this test")
                }

                override fun handshake(
                    socket: Socket,
                    host: String,
                    port: Int,
                    sniHost: String?,
                    timeoutMs: Int,
                    trustMode: CanaryTlsTrustMode
                ) {
                    trustModes += trustMode
                    if (trustMode == CanaryTlsTrustMode.NORMAL) throw SSLHandshakeException("untrusted")
                }
            }
        )

        val timing = transport.tlsHandshakeAnyCert("chat.signal.org", 443, "chat.signal.org", 10_000)

        assertEquals(listOf(CanaryTlsTrustMode.NORMAL, CanaryTlsTrustMode.ANY_CERT), trustModes)
        assertEquals(false, timing.certTrusted)
    }

    @Test
    fun tlsAnyCertFallbackUsesRemainingSharedDeadline() {
        var now = 0L
        val budgets = mutableListOf<Pair<CanaryTlsTrustMode, Int>>()
        val transport = SocketCanaryServiceReachTransport(
            clock = { now },
            operations = object : CanaryTlsProbeOperations {
                override fun resolve(host: String, port: Int, timeoutMs: Int): List<InetSocketAddress> =
                    listOf(loopback(port))

                override fun connect(socket: Socket, address: InetSocketAddress, timeoutMs: Int) {
                    now += 2_000L
                }

                override fun handshake(socket: Socket, host: String, port: Int, sniHost: String?, timeoutMs: Int) {
                    fail("trust mode must be explicit for this test")
                }

                override fun handshake(
                    socket: Socket,
                    host: String,
                    port: Int,
                    sniHost: String?,
                    timeoutMs: Int,
                    trustMode: CanaryTlsTrustMode
                ) {
                    budgets += trustMode to timeoutMs
                    if (trustMode == CanaryTlsTrustMode.NORMAL) {
                        now += 3_000L
                        throw SSLHandshakeException("untrusted")
                    }
                }
            }
        )

        transport.tlsHandshakeAnyCert("chat.signal.org", 443, "chat.signal.org", 10_000)

        assertEquals(
            listOf(
                CanaryTlsTrustMode.NORMAL to 8_000,
                CanaryTlsTrustMode.ANY_CERT to 3_000
            ),
            budgets
        )
    }

    @Test
    fun tcpModeConnectsWithoutTlsHandshake() {
        val executor = CanaryServiceReachExecutor(
            transport = object : CanaryServiceReachTransport {
                override fun tlsHandshake(host: String, port: Int, sniHost: String?, timeoutMs: Int): CanaryTlsReachTiming =
                    CanaryTlsReachTiming(1, 2)

                override fun tcpConnect(host: String, port: Int, timeoutMs: Int): Long {
                    assertEquals("g.whatsapp.net", host)
                    return 44
                }

                override fun stunBinding(host: String, port: Int, request: ByteArray, transactionId: ByteArray, timeoutMs: Int): Long = 3
            }
        )

        val result = executor.runServiceReach().single { it.host == "g.whatsapp.net" && it.port == 5222 }

        assertEquals("tcp", result.mode)
        assertEquals(44L, result.tcpMs)
        assertNull(result.tlsMs)
        assertNull(result.certTrusted)
    }

    @Test
    fun literalIpSkipsResolverAndPreservesNoSni() {
        val sniValues = mutableListOf<String?>()
        val transport = SocketCanaryServiceReachTransport(
            clock = { 1_000L },
            operations = object : CanaryTlsProbeOperations {
                override fun resolve(host: String, port: Int, timeoutMs: Int): List<InetSocketAddress> {
                    fail("literal IP must not use DNS resolver")
                    return emptyList()
                }

                override fun connect(socket: Socket, address: InetSocketAddress, timeoutMs: Int) {
                    assertEquals("149.154.167.50", address.address.hostAddress)
                    assertEquals(443, address.port)
                }

                override fun handshake(socket: Socket, host: String, port: Int, sniHost: String?, timeoutMs: Int) {
                    sniValues += sniHost
                }
            }
        )

        transport.tlsHandshake("149.154.167.50", 443, null, 10_000)

        assertEquals(listOf<String?>(null), sniValues)
    }

    @Test
    fun stunFailuresUseUdpSpecificCategories() {
        val failures = ArrayDeque<Throwable>().apply {
            add(SocketTimeoutException("timeout"))
            add(IllegalStateException("bad response"))
        }
        val executor = CanaryServiceReachExecutor(
            transport = object : CanaryServiceReachTransport {
                override fun tlsHandshake(host: String, port: Int, sniHost: String?, timeoutMs: Int): CanaryTlsReachTiming =
                    CanaryTlsReachTiming(1, 2)

                override fun stunBinding(host: String, port: Int, request: ByteArray, transactionId: ByteArray, timeoutMs: Int): Long {
                    throw failures.removeFirst()
                }
            }
        )

        val stunErrors = executor.runServiceReach().filter { it.protocol == "udp_stun" }.map { it.errorCategory }

        assertEquals(listOf(CanaryErrorCategory.UDP_TIMEOUT, CanaryErrorCategory.UDP_ERROR), stunErrors)
    }

    @Test
    fun deadlineRemainingUsesOneEndToEndBudget() {
        assertEquals(10_000, CanaryServiceReachDeadline.remainingMs(startedAtMs = 1_000, nowMs = 1_000, timeoutMs = 10_000))
        assertEquals(3_750, CanaryServiceReachDeadline.remainingMs(startedAtMs = 1_000, nowMs = 7_250, timeoutMs = 10_000))
        assertEquals(0, CanaryServiceReachDeadline.remainingMs(startedAtMs = 1_000, nowMs = 11_000, timeoutMs = 10_000))
        assertEquals(-1, CanaryServiceReachDeadline.remainingMs(startedAtMs = 1_000, nowMs = 11_001, timeoutMs = 10_000))
    }

    @Test
    fun tlsHandshakePassesOneAbsoluteDeadlineThroughDnsTcpAndTls() {
        var now = 0L
        val observedWindows = mutableListOf<Pair<String, Long>>()
        val transport = SocketCanaryServiceReachTransport(
            clock = { now },
            operations = object : CanaryTlsProbeOperations {
                override fun resolve(host: String, port: Int, timeoutMs: Int): List<InetSocketAddress> {
                    observedWindows += "dns" to now + timeoutMs
                    now += 2_500
                    return listOf(loopback(port))
                }

                override fun connect(socket: Socket, address: InetSocketAddress, timeoutMs: Int) {
                    observedWindows += "tcp" to now + timeoutMs
                    now += 3_000
                }

                override fun handshake(socket: Socket, host: String, port: Int, sniHost: String?, timeoutMs: Int) {
                    observedWindows += "tls" to now + timeoutMs
                    now += 4_499
                }
            }
        )

        val timing = transport.tlsHandshake("example.test", 443, "example.test", 10_000)

        assertEquals(3_000L, timing.tcpMs)
        assertEquals(4_499L, timing.tlsMs)
        assertEquals(listOf("dns" to 10_000L, "tcp" to 10_000L, "tls" to 10_000L), observedWindows)
        assertTrue(observedWindows.all { (_, absoluteDeadline) -> absoluteDeadline <= 10_000L })
    }

    @Test
    fun tlsHandshakeStopsBeforeConnectWhenDnsExhaustsSharedDeadline() {
        var now = 0L
        val transport = SocketCanaryServiceReachTransport(
            clock = { now },
            operations = object : CanaryTlsProbeOperations {
                override fun resolve(host: String, port: Int, timeoutMs: Int): List<InetSocketAddress> {
                    assertEquals(10_000, timeoutMs)
                    now += 10_000
                    return listOf(loopback(port))
                }

                override fun connect(socket: Socket, address: InetSocketAddress, timeoutMs: Int) {
                    fail("connect must not run after DNS consumes the shared deadline")
                }

                override fun handshake(socket: Socket, host: String, port: Int, sniHost: String?, timeoutMs: Int) {
                    fail("handshake must not run after DNS consumes the shared deadline")
                }
            }
        )

        val throwable = expectTimeout { transport.tlsHandshake("example.test", 443, "example.test", 10_000) }

        assertEquals("service reach TCP budget exhausted", throwable.message)
    }

    @Test
    fun tlsHandshakeStopsBeforeTlsWhenConnectExhaustsSharedDeadline() {
        var now = 0L
        val transport = SocketCanaryServiceReachTransport(
            clock = { now },
            operations = object : CanaryTlsProbeOperations {
                override fun resolve(host: String, port: Int, timeoutMs: Int): List<InetSocketAddress> {
                    now += 1
                    return listOf(loopback(port))
                }

                override fun connect(socket: Socket, address: InetSocketAddress, timeoutMs: Int) {
                    assertEquals(9_999, timeoutMs)
                    now += 9_999
                }

                override fun handshake(socket: Socket, host: String, port: Int, sniHost: String?, timeoutMs: Int) {
                    fail("handshake must not run after TCP consumes the shared deadline")
                }
            }
        )

        val throwable = expectTimeout { transport.tlsHandshake("example.test", 443, "example.test", 10_000) }

        assertEquals("service reach TLS budget exhausted", throwable.message)
    }

    @Test
    fun tlsHandshakeFailsWhenTlsRunsPastSharedDeadline() {
        var now = 0L
        val observedWindows = mutableListOf<Pair<String, Long>>()
        val transport = SocketCanaryServiceReachTransport(
            clock = { now },
            operations = object : CanaryTlsProbeOperations {
                override fun resolve(host: String, port: Int, timeoutMs: Int): List<InetSocketAddress> {
                    observedWindows += "dns" to now + timeoutMs
                    now += 1
                    return listOf(loopback(port))
                }

                override fun connect(socket: Socket, address: InetSocketAddress, timeoutMs: Int) {
                    observedWindows += "tcp" to now + timeoutMs
                    now += 1
                }

                override fun handshake(socket: Socket, host: String, port: Int, sniHost: String?, timeoutMs: Int) {
                    observedWindows += "tls" to now + timeoutMs
                    now += timeoutMs + 1L
                }
            }
        )

        val throwable = expectTimeout { transport.tlsHandshake("example.test", 443, "example.test", 10_000) }

        assertEquals("service reach TLS budget exhausted", throwable.message)
        assertEquals(listOf("dns" to 10_000L, "tcp" to 10_000L, "tls" to 10_000L), observedWindows)
        assertTrue(observedWindows.all { (_, absoluteDeadline) -> absoluteDeadline <= 10_000L })
    }

    @Test
    fun cancellableDnsTimeoutCancelsLookup() {
        val cancellation = FakeDnsCancellation()
        val resolver = CanaryCancellableDnsProbeResolver(
            apiLevel = { 29 },
            cancellationFactory = object : CanaryDnsCancellationFactory {
                override fun create(): CanaryDnsCancellation = cancellation
            },
            query = object : CanaryAsyncDnsQuery {
                override fun query(host: String, cancellation: CanaryDnsCancellation, callback: CanaryAsyncDnsCallback) {
                    assertEquals("example.test", host)
                }
            },
            await = { _, _ -> false }
        )

        val throwable = expectTimeout { resolver.resolve("example.test", 443, 10_000) }

        assertEquals("service reach DNS budget exhausted", throwable.message)
        assertTrue(cancellation.cancelled)
        assertEquals(CanaryErrorCategory.DNS_TIMEOUT, CanaryServiceReachErrors.category(throwable))
    }

    @Test
    fun repeatedDnsTimeoutsDoNotPoisonFutureProbeStart() {
        val cancellations = mutableListOf<FakeDnsCancellation>()
        val queryCalls = AtomicInteger(0)
        val callbacks = mutableListOf<CanaryAsyncDnsCallback>()
        val awaitResults = ArrayDeque<Boolean>().apply {
            repeat(6) { add(false) }
            add(true)
        }
        val resolver = CanaryCancellableDnsProbeResolver(
            apiLevel = { 29 },
            cancellationFactory = object : CanaryDnsCancellationFactory {
                override fun create(): CanaryDnsCancellation =
                    FakeDnsCancellation().also { cancellations += it }
            },
            query = object : CanaryAsyncDnsQuery {
                override fun query(host: String, cancellation: CanaryDnsCancellation, callback: CanaryAsyncDnsCallback) {
                    val call = queryCalls.incrementAndGet()
                    callbacks += callback
                    if (call == 7) {
                        callback.onAnswer(listOf(InetAddress.getByAddress(byteArrayOf(127, 0, 0, 1))))
                    }
                }
            },
            await = { _, _ -> awaitResults.removeFirst() }
        )

        repeat(6) {
            expectTimeout { resolver.resolve("example.test", 443, 10_000) }
        }
        val addresses = resolver.resolve("example.test", 443, 10_000)

        assertEquals(7, queryCalls.get())
        assertEquals(7, callbacks.size)
        assertEquals(6, cancellations.count { it.cancelled })
        assertEquals(listOf(loopback(443)), addresses)
    }

    @Test
    fun preAndroidQDnsUsesBoundedSystemUdpFallback() {
        val queryCalls = AtomicInteger(0)
        val server = InetAddress.getByAddress(byteArrayOf(9, 9, 9, 9))
        val observed = mutableListOf<Pair<InetAddress, Int>>()
        val resolver = CanaryCancellableDnsProbeResolver(
            apiLevel = { 28 },
            systemResolver = CanarySystemDnsResolver(
                provider = object : CanarySystemDnsServerProvider {
                    override fun current(): CanarySystemDnsConfig = CanarySystemDnsConfig(listOf(server))
                },
                udpClient = object : CanarySystemDnsUdpClient {
                    override fun exchange(
                        server: InetAddress,
                        request: ByteArray,
                        timeoutMs: Int,
                        bindSocket: (DatagramSocket) -> Unit
                    ): ByteArray {
                        observed += server to timeoutMs
                        val type = if (observed.size == 1) CanaryRawDnsMessage.TYPE_A else CanaryRawDnsMessage.TYPE_AAAA
                        return dnsResponse(request, "example.test", type, listOf(byteArrayOf(93, 184.toByte(), 216.toByte(), 34)))
                    }
                },
                nowMs = { 1_000L },
                nextId = { 0x1234 }
            ),
            query = object : CanaryAsyncDnsQuery {
                override fun query(host: String, cancellation: CanaryDnsCancellation, callback: CanaryAsyncDnsCallback) {
                    queryCalls.incrementAndGet()
                }
            }
        )

        val addresses = resolver.resolve("example.test", 443, 10_000)

        assertEquals(0, queryCalls.get())
        assertEquals(listOf(loopbackLike(93, 184, 216, 34, 443)), addresses)
        assertEquals(listOf(server to 10_000), observed)
    }

    @Test
    fun rawDnsValidationRejectsMismatchedMalformedOrNegativeResponses() {
        val query = CanaryRawDnsMessage.query("example.test", CanaryRawDnsMessage.TYPE_A, 0x1234)
        val valid = dnsResponse(query, "example.test", CanaryRawDnsMessage.TYPE_A, listOf(byteArrayOf(93, 184.toByte(), 216.toByte(), 34)))

        assertEquals(
            listOf("93.184.216.34"),
            CanaryRawDnsMessage.parseAddresses(valid, "example.test", CanaryRawDnsMessage.TYPE_A, 0x1234).map { it.hostAddress }
        )
        expectDnsFailure { CanaryRawDnsMessage.parseAddresses(valid, "example.test", CanaryRawDnsMessage.TYPE_A, 0x9999) }
        expectDnsFailure { CanaryRawDnsMessage.parseAddresses(valid.copyOf(10), "example.test", CanaryRawDnsMessage.TYPE_A, 0x1234) }
        expectDnsFailure {
            CanaryRawDnsMessage.parseAddresses(
                dnsResponse(query, "example.test", CanaryRawDnsMessage.TYPE_A, emptyList(), rcode = 3),
                "example.test",
                CanaryRawDnsMessage.TYPE_A,
                0x1234
            )
        }
        expectDnsFailure {
            CanaryRawDnsMessage.parseAddresses(
                dnsResponse(
                    CanaryRawDnsMessage.query("other.test", CanaryRawDnsMessage.TYPE_A, 0x1234),
                    "other.test",
                    CanaryRawDnsMessage.TYPE_A,
                    listOf(byteArrayOf(1, 2, 3, 4))
                ),
                "example.test",
                CanaryRawDnsMessage.TYPE_A,
                0x1234
            )
        }
    }

    @Test
    fun systemDnsFallbackSharesDeadlineAcrossServersAndTypes() {
        var now = 0L
        val servers = listOf(
            InetAddress.getByAddress(byteArrayOf(1, 1, 1, 1)),
            InetAddress.getByAddress(byteArrayOf(8, 8, 8, 8))
        )
        val windows = mutableListOf<Int>()
        val resolver = CanarySystemDnsResolver(
            provider = object : CanarySystemDnsServerProvider {
                override fun current(): CanarySystemDnsConfig = CanarySystemDnsConfig(servers)
            },
            udpClient = object : CanarySystemDnsUdpClient {
                override fun exchange(
                    server: InetAddress,
                    request: ByteArray,
                    timeoutMs: Int,
                    bindSocket: (DatagramSocket) -> Unit
                ): ByteArray {
                    windows += timeoutMs
                    now += 3_000
                    throw SocketTimeoutException("timeout")
                }
            },
            nowMs = { now },
            nextId = { 0x1234 }
        )

        val throwable = expectTimeout { resolver.resolve("example.test", 443, 10_000) }

        assertEquals("service reach DNS budget exhausted", throwable.message)
        assertEquals(listOf(10_000, 7_000, 4_000, 1_000), windows)
    }

    @Test
    fun datagramDnsClientClosesSocketAfterReceiveFailure() {
        val fakeSocket = FakeDnsSocket {
            throw SocketTimeoutException("timeout")
        }
        val client = DatagramCanarySystemDnsUdpClient(
            socketFactory = object : CanaryDnsDatagramSocketFactory {
                override fun open(bindSocket: (DatagramSocket) -> Unit): CanaryDnsDatagramSocket = fakeSocket
            }
        )

        expectTimeout {
            client.exchange(InetAddress.getByAddress(byteArrayOf(1, 1, 1, 1)), byteArrayOf(1), 1234) {}
        }

        assertEquals(1234, fakeSocket.soTimeout)
        assertTrue(fakeSocket.sent)
        assertTrue(fakeSocket.closed)
    }

    @Test
    fun jvmDatagramSocketFactoryClosesRawSocketWhenBindThrows() {
        val rawSocket = ObservableDatagramSocket()
        val failure = IllegalStateException("bind failed")
        val factory = JvmCanaryDnsDatagramSocketFactory { rawSocket }

        try {
            factory.open { throw failure }
            fail("expected bind failure")
        } catch (throwable: IllegalStateException) {
            assertTrue(throwable === failure)
        }

        assertTrue(rawSocket.closed)
    }

    @Test
    fun apnsReachRunsOnlyApnsTargets() {
        val executor = CanaryServiceReachExecutor(
            transport = object : CanaryServiceReachTransport {
                override fun tlsHandshake(host: String, port: Int, sniHost: String?, timeoutMs: Int): CanaryTlsReachTiming =
                    CanaryTlsReachTiming(1, 2)

                override fun tlsHandshakeAnyCert(host: String, port: Int, sniHost: String?, timeoutMs: Int): CanaryTlsReachTiming =
                    CanaryTlsReachTiming(3, 4, certTrusted = false)

                override fun stunBinding(host: String, port: Int, request: ByteArray, transactionId: ByteArray, timeoutMs: Int): Long =
                    error("APNs reach must not run STUN")
            }
        )

        val results = executor.runApnsReach()

        assertEquals(listOf("apns_reach", "apns_reach", "apns_reach"), results.map { it.testType })
        assertEquals(listOf("1-courier.push.apple.com", "1-courier.push.apple.com", "api.push.apple.com"), results.map { it.host })
        assertEquals(listOf("tls_any_cert", "tls_any_cert", "tls"), results.map { it.mode })
        assertEquals(listOf(false, false, true), results.map { it.certTrusted })
    }

    @Test
    fun serviceReachAndApnsReachShareNonOverlappingGuard() {
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val transport = object : CanaryServiceReachTransport {
            override fun tlsHandshake(host: String, port: Int, sniHost: String?, timeoutMs: Int): CanaryTlsReachTiming {
                entered.countDown()
                assertTrue(release.await(2, TimeUnit.SECONDS))
                return CanaryTlsReachTiming(1, 2)
            }

            override fun stunBinding(host: String, port: Int, request: ByteArray, transactionId: ByteArray, timeoutMs: Int): Long = 3
        }
        val executor = CanaryServiceReachExecutor(transport = transport)
        val worker = Thread { executor.runServiceReach() }

        try {
            worker.start()
            assertTrue(entered.await(2, TimeUnit.SECONDS))

            assertTrue(executor.runApnsReach().isEmpty())
        } finally {
            release.countDown()
            worker.join(2_000)
        }
    }

    @Test
    fun fullRunReachHoldsGuardAcrossApnsAndDailyServiceReach() {
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val calls = AtomicInteger(0)
        val transport = object : CanaryServiceReachTransport {
            override fun tlsHandshake(host: String, port: Int, sniHost: String?, timeoutMs: Int): CanaryTlsReachTiming {
                calls.incrementAndGet()
                entered.countDown()
                assertTrue(release.await(2, TimeUnit.SECONDS))
                return CanaryTlsReachTiming(1, 2)
            }

            override fun stunBinding(host: String, port: Int, request: ByteArray, transactionId: ByteArray, timeoutMs: Int): Long = 3
        }
        val executor = CanaryServiceReachExecutor(transport = transport)
        val worker = Thread { executor.runFullRunReach(includeServiceReach = true) }

        try {
            worker.start()
            assertTrue(entered.await(2, TimeUnit.SECONDS))

            assertTrue(executor.runServiceReach().isEmpty())
            assertEquals(1, calls.get())
        } finally {
            release.countDown()
            worker.join(2_000)
        }
    }

    @Test
    fun dailyPlannerCoalescesByUtcDay() {
        assertTrue(CanaryServiceReachDailyPlanner.shouldRun(0L, null))
        assertTrue(CanaryServiceReachDailyPlanner.shouldRun(0L, "1969-12-31"))
        assertFalse(CanaryServiceReachDailyPlanner.shouldRun(0L, "1970-01-01"))
        assertEquals("1970-01-01", CanaryServiceReachDailyPlanner.utcDay(0L))
    }

    @Test
    fun stunBindingRequestAndResponseValidationIsDeterministic() {
        val transactionId = ByteArray(12) { it.toByte() }
        val request = CanaryStunMessage.bindingRequest(transactionId)

        assertEquals(20, request.bytes.size)
        assertTrue(CanaryStunMessage.isBindingSuccess(stunSuccess(transactionId), transactionId))
        assertFalse(CanaryStunMessage.isBindingSuccess(stunSuccess(ByteArray(12) { 9 }), transactionId))
    }

    @Test
    fun timeoutMapsToSafeErrorCategory() {
        assertEquals(
            net.hearth.canary.light.CanaryErrorCategory.TCP_TIMEOUT,
            CanaryServiceReachErrors.category(SocketTimeoutException("timeout"))
        )
    }

    private fun stunSuccess(transactionId: ByteArray): ByteArray {
        val response = ByteArray(20)
        response[0] = 0x01
        response[1] = 0x01
        response[4] = 0x21
        response[5] = 0x12
        response[6] = 0xA4.toByte()
        response[7] = 0x42
        transactionId.copyInto(response, 8)
        return response
    }

    private fun loopback(port: Int): InetSocketAddress =
        InetSocketAddress(InetAddress.getByAddress(byteArrayOf(127, 0, 0, 1)), port)

    private fun loopbackLike(a: Int, b: Int, c: Int, d: Int, port: Int): InetSocketAddress =
        InetSocketAddress(InetAddress.getByAddress(byteArrayOf(a.toByte(), b.toByte(), c.toByte(), d.toByte())), port)

    private fun expectTimeout(block: () -> Unit): SocketTimeoutException =
        try {
            block()
            fail("expected SocketTimeoutException")
            error("unreachable")
        } catch (throwable: SocketTimeoutException) {
            throwable
        }

    private fun expectDnsFailure(block: () -> Unit): CanaryServiceReachDnsException =
        try {
            block()
            fail("expected CanaryServiceReachDnsException")
            error("unreachable")
        } catch (throwable: CanaryServiceReachDnsException) {
            throwable
        }

    private fun dnsResponse(
        query: ByteArray,
        answerHost: String,
        type: Int,
        answers: List<ByteArray>,
        rcode: Int = 0
    ): ByteArray {
        val out = ByteArrayOutputStream()
        out.write(query[0].toInt())
        out.write(query[1].toInt())
        out.write(0x81)
        out.write(0x80 or (rcode and 0x0f))
        out.write(0)
        out.write(1)
        out.write((answers.size ushr 8) and 0xff)
        out.write(answers.size and 0xff)
        out.write(0)
        out.write(0)
        out.write(0)
        out.write(0)
        out.write(query.copyOfRange(12, query.size))
        answers.forEach { data ->
            writeDnsName(out, answerHost)
            writeU16(out, type)
            writeU16(out, 1)
            out.write(byteArrayOf(0, 0, 0, 60))
            writeU16(out, data.size)
            out.write(data)
        }
        return out.toByteArray()
    }

    private fun writeDnsName(out: ByteArrayOutputStream, host: String) {
        host.split('.').forEach { label ->
            val bytes = label.toByteArray(Charsets.UTF_8)
            out.write(bytes.size)
            out.write(bytes)
        }
        out.write(0)
    }

    private fun writeU16(out: ByteArrayOutputStream, value: Int) {
        out.write((value ushr 8) and 0xff)
        out.write(value and 0xff)
    }

    private class FakeDnsCancellation : CanaryDnsCancellation {
        var cancelled = false

        override fun cancel() {
            cancelled = true
        }
    }

    private class FakeDnsSocket(
        private val receiveBlock: () -> Unit
    ) : CanaryDnsDatagramSocket {
        override var soTimeout: Int = 0
        var sent = false
        var closed = false

        override fun send(packet: DatagramPacket) {
            sent = true
        }

        override fun receive(packet: DatagramPacket) {
            receiveBlock()
        }

        override fun close() {
            closed = true
        }
    }

    private class ObservableDatagramSocket : DatagramSocket(null as java.net.SocketAddress?) {
        var closed = false

        override fun close() {
            closed = true
            super.close()
        }
    }
}
