package net.hearth.canary.full

import android.content.Context
import net.hearth.canary.BuildConfig
import net.hearth.canary.light.CanaryCorrelation
import net.hearth.canary.light.CanaryErrorCategory
import net.hearth.canary.light.CanaryLightRunExecutor
import net.hearth.canary.light.CanaryPhases
import net.hearth.canary.light.CanaryTestResult
import net.hearth.canary.monitor.CanaryEventEntity
import net.hearth.canary.monitor.CanaryEventJournal
import okhttp3.CertificatePinner
import okhttp3.Dns
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.security.SecureRandom
import java.time.Instant
import java.time.ZoneId
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.zip.GZIPOutputStream
import javax.net.ssl.SSLSocketFactory

class CanaryFullRunExecutor(
    context: Context,
    private val journal: CanaryEventJournal? = null,
    private val clock: () -> Long = System::currentTimeMillis
) {
    private val appContext = context.applicationContext
    private val deviceLabel = CanaryCorrelation.deviceLabel(appContext)
    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .writeTimeout(8, TimeUnit.SECONDS)
        .callTimeout(15, TimeUnit.SECONDS)
        .build()
    private val pinnedClient = pinnedClient()
    private val heartbeatKeeper = CanaryHeartbeatKeeper(deviceLabel, { clock() }, { pinnedClient() })
    private val random = SecureRandom()

    fun run(includeUploads: Boolean, includeDailyUpload: Boolean, includeJournalUpload: Boolean): List<CanaryTestResult> {
        val results = mutableListOf<CanaryTestResult>()
        results += wsDomain()
        results += ipDirect()
        results += dohResolve()
        results += latencySample()
        results += dnsConsistency()
        results += reachabilityTargets()
        results += heartbeatKeeper.probe()
        results += turnProbe("turn_tls", 5349, tls = true)
        results += turnProbe("turn_tcp", 3478, tls = false)
        if (includeUploads) {
            CanaryUploadSchedule.smallPayloadsForUtcHour(Instant.ofEpochMilli(clock()).atZone(java.time.ZoneOffset.UTC).hour)
                .forEach { results += payloadUpload(it) }
            if (includeDailyUpload) {
                results += payloadUpload(2 * 1024 * 1024)
            }
        }
        if (includeJournalUpload && journal != null) {
            results += journalUpload(journal)
        }
        return results.map { it.copy(runKind = CanaryRunKind.FULL.wireValue) }
    }

    private fun wsDomain(): CanaryTestResult =
        webSocketEcho("ws_domain", "domain", CanaryLightRunExecutor.SERVER_WS_URL)

    private fun ipDirect(): List<CanaryTestResult> =
        runCatching { InetAddress.getAllByName(CanaryLightRunExecutor.SERVER_HOST).mapNotNull { it.hostAddress }.take(1) }
            .getOrDefault(emptyList())
            .flatMap { ip ->
                DIRECT_SNI_HOSTS.flatMap { sniHost ->
                    listOf(
                        httpIpDirect(ip, sniHost),
                        webSocketEcho("ip_direct", "ws", "wss://$sniHost/hearth-canary/", directClient(ip, sniHost), sniHost)
                    )
                }
            }
            .ifEmpty {
                listOf(failure("ip_direct", CanaryLightRunExecutor.SERVER_HOST, CanaryErrorCategory.DNS_NXDOMAIN, "No server address"))
            }

    private fun httpIpDirect(ip: String, sniHost: String): CanaryTestResult {
        val startedAt = clock()
        val request = Request.Builder()
            .url("https://$sniHost/hearth-canary/")
            .header("Host", CanaryLightRunExecutor.SERVER_HOST)
            .header(CanaryCorrelation.DEVICE_LABEL_HEADER, deviceLabel)
            .get()
            .build()
        return executeStatusOnly("ip_direct", ip, request, directClient(ip, sniHost)).copy(
            latencyMs = clock() - startedAt,
            mode = "http",
            sni = sniHost
        )
    }

    private fun dohResolve(): List<CanaryTestResult> =
        DOH_PROVIDERS.map { provider ->
            val url = "${provider.url}?name=${CanaryLightRunExecutor.SERVER_HOST}&type=A"
            val request = Request.Builder()
                .url(url)
                .header("Accept", "application/dns-json")
                .header(CanaryCorrelation.DEVICE_LABEL_HEADER, deviceLabel)
                .get()
                .build()
            val startedAt = clock()
            try {
                client.newCall(request).execute().use { response ->
                    val body = response.body?.string().orEmpty()
                    val addresses = if (response.isSuccessful) CanaryDohParser.parseValidAddresses(body) else emptyList()
                    CanaryTestResult(
                        testType = "doh_resolve",
                        target = CanaryLightRunExecutor.SERVER_HOST,
                        success = response.isSuccessful && addresses.isNotEmpty(),
                        errorCategory = if (response.isSuccessful && addresses.isNotEmpty()) CanaryErrorCategory.NONE else CanaryErrorCategory.HTTP_ERROR,
                        errorDetail = if (response.isSuccessful && addresses.isNotEmpty()) null else "HTTP ${response.code}",
                        latencyMs = clock() - startedAt,
                        resolvedAddresses = addresses,
                        provider = provider.name,
                        httpStatus = response.code
                    )
                }
            } catch (throwable: Throwable) {
                failure("doh_resolve", CanaryLightRunExecutor.SERVER_HOST, CanaryErrorCategory.OTHER, throwable.message, throwable, provider.name)
            }
        }

    private fun latencySample(): CanaryTestResult {
        val values = mutableListOf<Long>()
        var failure: Throwable? = null
        val connectionId = CanaryCorrelation.newConnectionId()
        val openLatch = CountDownLatch(1)
        val latches = List(10) { CountDownLatch(1) }
        val sentAt = LongArray(10)
        val request = CanaryCorrelation.websocketRequest(CanaryLightRunExecutor.SERVER_WS_URL, deviceLabel, connectionId)
        val socket = pinnedClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                openLatch.countDown()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val index = text.removePrefix("latency-$connectionId-").toIntOrNull()
                if (index != null && index in 0..9 && sentAt[index] > 0L) {
                    values += clock() - sentAt[index]
                    latches[index].countDown()
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                failure = t
                openLatch.countDown()
                latches.forEach { it.countDown() }
            }
        })
        if (openLatch.await(7, TimeUnit.SECONDS) && failure == null) {
            repeat(10) { index ->
                val payload = "latency-$connectionId-$index"
                sentAt[index] = clock()
                if (!socket.send(payload)) {
                    latches[index].countDown()
                } else {
                    latches[index].await(900, TimeUnit.MILLISECONDS)
                }
                if (index != 9) TimeUnit.SECONDS.sleep(1)
            }
        }
        socket.close(1000, "done")
        val aggregate = CanaryLatencyStats.aggregate(values)
        return CanaryTestResult(
            testType = "latency_sample",
            target = CanaryLightRunExecutor.SERVER_HOST,
            success = aggregate.count > 0,
            errorCategory = if (aggregate.count > 0) CanaryErrorCategory.NONE else CanaryErrorCategory.TCP_TIMEOUT,
            errorDetail = CanarySecretScrubber.safeError(failure?.message),
            exceptionClass = failure?.javaClass?.name,
            valuesMs = values,
            count = aggregate.count,
            minMs = aggregate.minMs,
            medianMs = aggregate.medianMs,
            p90Ms = aggregate.p90Ms,
            maxMs = aggregate.maxMs,
            lost = aggregate.lost
        )
    }

    private fun dnsConsistency(): CanaryTestResult {
        val system = runCatching { InetAddress.getAllByName(CanaryLightRunExecutor.SERVER_HOST).mapNotNull { it.hostAddress }.toSet() }
            .getOrDefault(emptySet())
        val doh = dohResolve().flatMap { it.resolvedAddresses }.toSet()
        val consistent = system.isNotEmpty() && doh.isNotEmpty() && system.intersect(doh).isNotEmpty()
        return CanaryTestResult(
            testType = "dns_consistency",
            target = CanaryLightRunExecutor.SERVER_HOST,
            success = consistent,
            errorCategory = if (consistent) CanaryErrorCategory.NONE else CanaryErrorCategory.DNS_INVALID_ADDRESS,
            resolvedAddresses = (system + doh).toList(),
            changed = !consistent
        )
    }

    private fun reachabilityTargets(): List<CanaryTestResult> =
        (FCM_REACH_TARGETS.map { reachability("fcm_reach", it.host, it.port) } +
            reachability("imo_reach", "imo.im", 443))

    private fun reachability(testType: String, host: String, port: Int): CanaryTestResult {
        val startedAt = clock()
        return try {
            val socket = SSLSocketFactory.getDefault().createSocket() as javax.net.ssl.SSLSocket
            socket.soTimeout = 5000
            socket.connect(InetSocketAddress(host, port), 5000)
            socket.startHandshake()
            socket.close()
            CanaryTestResult(
                testType = testType,
                target = "$host:$port",
                success = true,
                errorCategory = CanaryErrorCategory.NONE,
                latencyMs = clock() - startedAt,
                connectMs = clock() - startedAt
            )
        } catch (throwable: Throwable) {
            failure(testType, "$host:$port", CanaryErrorCategory.TLS_HANDSHAKE_ERROR, throwable.message, throwable)
        }
    }

    private fun turnProbe(testType: String, port: Int, tls: Boolean): CanaryTestResult {
        val startedAt = clock()
        val credentialResult = turnCredentials()
        val credential = credentialResult.getOrElse {
            return failure(testType, "${CanaryLightRunExecutor.SERVER_HOST}:$port", CanaryErrorCategory.TURN_ERROR, it.message, it)
        }
        val connectStart = clock()
        var connectMs: Long? = null
        var tlsMs: Long? = null
        var allocateMs: Long? = null
        var echoRttMs: Long? = null
        var turnErrorCode: Int? = null
        return try {
            val socket = if (tls) {
                val tlsStart = clock()
                (SSLSocketFactory.getDefault().createSocket(CanaryLightRunExecutor.SERVER_HOST, port) as javax.net.ssl.SSLSocket).also {
                    it.soTimeout = 7000
                    it.startHandshake()
                    tlsMs = clock() - tlsStart
                }
            } else {
                Socket(CanaryLightRunExecutor.SERVER_HOST, port)
            }
            socket.soTimeout = 7000
            connectMs = clock() - connectStart
            val input = socket.getInputStream()
            val output = socket.getOutputStream()
            val allocateStart = clock()
            output.write(CanaryTurnMessage.allocateChallenge())
            output.flush()
            val challenge = readStun(input)
            val realm = CanaryTurnMessage.stringAttribute(challenge, CanaryTurnMessage.ATTR_REALM)
                ?: error("TURN challenge missing realm")
            val nonce = CanaryTurnMessage.stringAttribute(challenge, CanaryTurnMessage.ATTR_NONCE)
                ?: error("TURN challenge missing nonce")
            output.write(CanaryTurnMessage.allocateAuthenticated(credential.username, realm, nonce, credential.password))
            output.flush()
            val allocateResponse = readStun(input)
            allocateMs = clock() - allocateStart
            val allocateError = CanaryTurnMessage.errorCode(allocateResponse).also { turnErrorCode = it }
            check(CanaryTurnMessage.isSuccess(allocateResponse, CanaryTurnMessage.METHOD_ALLOCATE)) {
                "TURN allocate failed code=${allocateError ?: "unknown"}"
            }
            output.write(CanaryTurnMessage.createPermission(credential.username, realm, nonce, credential.password, TURN_ECHO_HOST, TURN_ECHO_PORT))
            output.flush()
            val permissionResponse = readStun(input)
            val permissionError = CanaryTurnMessage.errorCode(permissionResponse).also { turnErrorCode = it }
            check(CanaryTurnMessage.isSuccess(permissionResponse, CanaryTurnMessage.METHOD_CREATE_PERMISSION)) {
                "TURN create permission failed code=${permissionError ?: "unknown"}"
            }
            val echoPayload = ByteArray(8 * 1024) { (it % 251).toByte() }
            val echoStart = clock()
            output.write(CanaryTurnMessage.sendIndication(TURN_ECHO_HOST, TURN_ECHO_PORT, echoPayload))
            output.flush()
            val echoed = readUntilData(input)
            echoRttMs = clock() - echoStart
            check(echoed.contentEquals(echoPayload)) { "TURN echo payload mismatch" }
            socket.close()
            CanaryTestResult(
                testType = testType,
                target = "${CanaryLightRunExecutor.SERVER_HOST}:$port",
                success = true,
                errorCategory = CanaryErrorCategory.NONE,
                latencyMs = clock() - startedAt,
                connectMs = connectMs,
                tlsMs = tlsMs,
                allocateMs = allocateMs,
                echoRttMs = echoRttMs,
                echoBytes = echoPayload.size,
                throughputKbps = CanaryPayloadMetrics.throughputKbps(echoPayload.size.toLong(), echoRttMs ?: 0L)
            )
        } catch (throwable: Throwable) {
            failure(testType, "${CanaryLightRunExecutor.SERVER_HOST}:$port", CanaryErrorCategory.TURN_ERROR, CanarySecretScrubber.safeError(throwable.message), throwable)
                .copy(connectMs = connectMs, tlsMs = tlsMs, allocateMs = allocateMs, echoRttMs = echoRttMs, turnErrorCode = turnErrorCode)
        }
    }

    private fun turnCredentials(): Result<TurnCredential> =
        runCatching {
            val request = Request.Builder()
                .url("https://${CanaryLightRunExecutor.SERVER_HOST}/hearth-canary/turn-cred")
                .header("X-Canary-Key", BuildConfig.CANARY_API_KEY)
                .header(CanaryCorrelation.DEVICE_LABEL_HEADER, deviceLabel)
                .get()
                .build()
            pinnedClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) error("TURN credential HTTP ${response.code}")
                val json = JSONObject(response.body?.string().orEmpty())
                TurnCredential(
                    username = json.getString("username"),
                    password = json.getString("password")
                )
            }
        }

    private fun payloadUpload(payloadBytes: Int): CanaryTestResult {
        val bytes = ByteArray(payloadBytes).also(random::nextBytes)
        val startedAt = clock()
        val request = Request.Builder()
            .url("https://${CanaryLightRunExecutor.SERVER_HOST}/hearth-canary/upload")
            .header("X-Canary-Key", BuildConfig.CANARY_API_KEY)
            .header(CanaryCorrelation.DEVICE_LABEL_HEADER, deviceLabel)
            .post(bytes.toRequestBody("application/octet-stream".toMediaType()))
            .build()
        return try {
            pinnedClient.newCall(request).execute().use { response ->
                val body = response.body?.string().orEmpty()
                val confirmed = runCatching { JSONObject(body).optLong("bytes", -1L) }.getOrDefault(-1L)
                val elapsed = (clock() - startedAt).coerceAtLeast(1L)
                CanaryTestResult(
                    testType = "payload_upload",
                    target = CanaryLightRunExecutor.SERVER_HOST,
                    success = response.isSuccessful && confirmed == payloadBytes.toLong(),
                    errorCategory = if (response.isSuccessful && confirmed == payloadBytes.toLong()) CanaryErrorCategory.NONE else CanaryErrorCategory.HTTP_ERROR,
                    errorDetail = if (response.isSuccessful) null else "HTTP ${response.code}",
                    latencyMs = elapsed,
                    httpStatus = response.code,
                    payloadBytes = payloadBytes,
                    bytesConfirmed = confirmed.takeIf { it >= 0L },
                    throughputKbps = CanaryPayloadMetrics.throughputKbps(payloadBytes.toLong(), elapsed)
                )
            }
        } catch (throwable: Throwable) {
            failure("payload_upload", CanaryLightRunExecutor.SERVER_HOST, CanaryErrorCategory.OTHER, throwable.message, throwable)
                .copy(payloadBytes = payloadBytes)
        }
    }

    private fun journalUpload(journal: CanaryEventJournal): CanaryTestResult {
        val records = journal.unsentOldestFirst(250)
        if (records.isEmpty()) {
            return CanaryTestResult("journal_upload", CanaryLightRunExecutor.SERVER_HOST, true, CanaryErrorCategory.NONE, bytesConfirmed = 0L)
        }
        val payload = gzip(journalPayload(records).toString().toByteArray(Charsets.UTF_8))
        val request = Request.Builder()
            .url("https://${CanaryLightRunExecutor.SERVER_HOST}/hearth-canary/journal")
            .header("X-Canary-Key", BuildConfig.CANARY_API_KEY)
            .header(CanaryCorrelation.DEVICE_LABEL_HEADER, deviceLabel)
            .header("Content-Encoding", "gzip")
            .post(payload.toRequestBody("application/json".toMediaType()))
            .build()
        return try {
            pinnedClient.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    journal.markSent(records.map { it.recordId }, clock())
                }
                CanaryTestResult(
                    testType = "journal_upload",
                    target = CanaryLightRunExecutor.SERVER_HOST,
                    success = response.isSuccessful,
                    errorCategory = if (response.isSuccessful) CanaryErrorCategory.NONE else CanaryErrorCategory.HTTP_ERROR,
                    errorDetail = if (response.isSuccessful) null else "HTTP ${response.code}",
                    httpStatus = response.code,
                    payloadBytes = payload.size,
                    bytesConfirmed = if (response.isSuccessful) records.size.toLong() else null
                )
            }
        } catch (throwable: Throwable) {
            failure("journal_upload", CanaryLightRunExecutor.SERVER_HOST, CanaryErrorCategory.OTHER, throwable.message, throwable)
        }
    }

    private fun journalPayload(records: List<CanaryEventEntity>): JSONObject =
        JSONObject()
            .put("format", "hearth-canary-journal-v4")
            .put("exportedAtUtc", clock())
            .put("deviceLabel", deviceLabel)
            .put("records", JSONArray(records.map { JSONObject(it.payloadJson) }))

    private fun webSocketEcho(
        testType: String,
        mode: String,
        url: String,
        okHttpClient: OkHttpClient = client,
        sniHost: String = mode
    ): CanaryTestResult {
        val connectionId = CanaryCorrelation.newConnectionId()
        val latch = CountDownLatch(1)
        val opened = booleanArrayOf(false)
        val startedAt = clock()
        var failure: Throwable? = null
        val request = CanaryCorrelation.websocketRequest(url, deviceLabel, connectionId)
        val socket = okHttpClient.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                opened[0] = true
                webSocket.send("canary-full-$connectionId")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                latch.countDown()
                webSocket.close(1000, "done")
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                latch.countDown()
                webSocket.close(1000, "done")
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                failure = t
                latch.countDown()
            }
        })
        val success = latch.await(7, TimeUnit.SECONDS) && failure == null && opened[0]
        if (!success) socket.cancel()
        return CanaryTestResult(
            testType = testType,
            target = CanaryLightRunExecutor.SERVER_HOST,
            success = success,
            errorCategory = if (success) CanaryErrorCategory.NONE else CanaryErrorCategory.WS_TIMEOUT,
            errorDetail = failure?.message?.take(200),
            exceptionClass = failure?.javaClass?.name,
            latencyMs = clock() - startedAt,
            connectionId = connectionId,
            mode = mode,
            sni = sniHost
        )
    }

    private fun executeStatusOnly(testType: String, target: String, request: Request, okHttpClient: OkHttpClient): CanaryTestResult =
        try {
            okHttpClient.newCall(request).execute().use { response ->
                CanaryTestResult(
                    testType = testType,
                    target = target,
                    success = response.code in 200..399,
                    errorCategory = if (response.code in 200..399) CanaryErrorCategory.NONE else CanaryErrorCategory.HTTP_ERROR,
                    errorDetail = if (response.code in 200..399) null else "HTTP ${response.code}",
                    httpStatus = response.code
                )
            }
        } catch (throwable: Throwable) {
            failure(testType, target, CanaryErrorCategory.OTHER, throwable.message, throwable)
        }

    private fun pinnedClient(): OkHttpClient {
        val pins = listOf(BuildConfig.CANARY_TLS_PIN_SHA256_1, BuildConfig.CANARY_TLS_PIN_SHA256_2).filter { it.isNotBlank() }
        if (pins.isEmpty()) return client
        val pinner = CertificatePinner.Builder().apply {
            pins.forEach { add(CanaryLightRunExecutor.SERVER_HOST, if (it.startsWith("sha256/")) it else "sha256/$it") }
        }.build()
        return client.newBuilder().certificatePinner(pinner).build()
    }

    private fun directClient(ip: String, sniHost: String): OkHttpClient {
        val pins = listOf(BuildConfig.CANARY_TLS_PIN_SHA256_1, BuildConfig.CANARY_TLS_PIN_SHA256_2).filter { it.isNotBlank() }
        val builder = client.newBuilder()
            .dns(object : Dns {
                override fun lookup(hostname: String): List<InetAddress> =
                    if (hostname == sniHost) listOf(InetAddress.getByName(ip)) else Dns.SYSTEM.lookup(hostname)
            })
            .hostnameVerifier { host, _ -> host == sniHost }
        if (pins.isNotEmpty()) {
            builder.certificatePinner(CertificatePinner.Builder().apply {
                pins.forEach { pin ->
                    add(sniHost, if (pin.startsWith("sha256/")) pin else "sha256/$pin")
                }
            }.build())
        }
        return builder.build()
    }

    private fun failure(
        testType: String,
        target: String,
        category: CanaryErrorCategory,
        detail: String?,
        throwable: Throwable? = null,
        provider: String? = null
    ): CanaryTestResult =
        CanaryTestResult(
            testType = testType,
            target = target,
            success = false,
            errorCategory = category,
            errorDetail = CanarySecretScrubber.safeError(detail),
            exceptionClass = throwable?.javaClass?.name,
            provider = provider
        )

    data class Target(val host: String, val port: Int)
    data class DohProvider(val name: String, val url: String)
    private data class TurnCredential(val username: String, val password: String)

    companion object {
        val DOH_PROVIDERS = listOf(
            DohProvider("cloudflare", "https://cloudflare-dns.com/dns-query"),
            DohProvider("google", "https://dns.google/resolve"),
            DohProvider("quad9", "https://dns.quad9.net/dns-query")
        )
        val FCM_REACH_TARGETS = listOf(
            Target("mtalk.google.com", 5228),
            Target("mtalk.google.com", 443),
            Target("fcm.googleapis.com", 443),
            Target("firebaseinstallations.googleapis.com", 443),
            Target("android.clients.google.com", 443)
        )
        val HEARTBEAT_INTERVALS = listOf(60, 240, 540)
        val DIRECT_SNI_HOSTS = listOf(CanaryLightRunExecutor.SERVER_HOST, "www.example.com")
        const val TURN_ECHO_HOST = "127.0.0.1"
        const val TURN_ECHO_PORT = 9999

        fun shouldRunNightlyJournalUpload(epochMs: Long, zoneId: ZoneId = ZoneId.systemDefault()): Boolean {
            val local = Instant.ofEpochMilli(epochMs).atZone(zoneId)
            return local.hour == 3 && local.minute in 0..30
        }
    }
}

private class CanaryHeartbeatKeeper(
    private val deviceLabel: String,
    private val clock: () -> Long,
    private val clientProvider: () -> OkHttpClient
) {
    private val tracks = CanaryFullRunExecutor.HEARTBEAT_INTERVALS.associateWith { interval ->
        HeartbeatTrack(interval)
    }

    fun probe(): List<CanaryTestResult> =
        tracks.values.mapNotNull { it.probe(deviceLabel, clock, clientProvider()) }
}

private class HeartbeatTrack(private val intervalSec: Int) {
    private var socket: WebSocket? = null
    private var connectionId: String = CanaryCorrelation.newConnectionId()
    private var connectedAtMs: Long = 0L
    @Volatile private var failure: Throwable? = null

    fun probe(deviceLabel: String, clock: () -> Long, client: OkHttpClient): CanaryTestResult? {
        val now = clock()
        ensureSocket(deviceLabel, clock, client)
        val socketNow = socket ?: return dead(clock, "open_failed", failure)
        if (now - connectedAtMs < intervalSec * 1000L) return null

        val latch = CountDownLatch(1)
        val payload = "heartbeat-$intervalSec-$connectionId-${now}"
        expected = ExpectedHeartbeat(payload, latch)
        if (!socketNow.send(payload) || !latch.await(5, TimeUnit.SECONDS)) {
            val result = dead(clock, "echo_timeout", failure)
            socketNow.cancel()
            socket = null
            connectionId = CanaryCorrelation.newConnectionId()
            connectedAtMs = 0L
            return result
        }
        return null
    }

    @Volatile private var expected: ExpectedHeartbeat? = null

    private fun ensureSocket(deviceLabel: String, clock: () -> Long, client: OkHttpClient) {
        if (socket != null) return
        failure = null
        connectedAtMs = clock()
        val request = CanaryCorrelation.websocketRequest(CanaryLightRunExecutor.SERVER_WS_URL, deviceLabel, connectionId)
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                expected?.takeIf { it.payload == text }?.let {
                    it.latch.countDown()
                    expected = null
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                failure = IOException("closed:$code")
                socket = null
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                failure = t
                socket = null
            }
        })
    }

    private fun dead(clock: () -> Long, reason: String, throwable: Throwable?): CanaryTestResult =
        CanaryTestResult(
            testType = "ws_heartbeat_dead",
            target = CanaryLightRunExecutor.SERVER_HOST,
            success = false,
            errorCategory = CanaryErrorCategory.WS_CLOSED,
            errorDetail = CanarySecretScrubber.safeError(throwable?.message),
            exceptionClass = throwable?.javaClass?.name,
            intervalSec = intervalSec,
            ageSec = ((clock() - connectedAtMs).coerceAtLeast(0L)) / 1000L,
            reason = reason,
            networkType = "unknown"
        )
}

private data class ExpectedHeartbeat(val payload: String, val latch: CountDownLatch)

private fun readUntilData(input: InputStream): ByteArray {
    repeat(4) {
        val message = readStun(input)
        if (CanaryTurnMessage.type(message) == CanaryTurnMessage.METHOD_DATA) {
            return CanaryTurnMessage.dataAttribute(message) ?: ByteArray(0)
        }
    }
    error("TURN data indication missing")
}

private fun readStun(input: InputStream): ByteArray {
    val header = input.readExact(20)
    val size = (((header[2].toInt() and 0xff) shl 8) or (header[3].toInt() and 0xff))
    return header + input.readExact(size)
}

private fun InputStream.readExact(size: Int): ByteArray {
    val out = ByteArray(size)
    var offset = 0
    while (offset < size) {
        val read = read(out, offset, size - offset)
        if (read < 0) error("Unexpected EOF reading TURN message")
        offset += read
    }
    return out
}

private fun gzip(bytes: ByteArray): ByteArray {
    val out = ByteArrayOutputStream()
    GZIPOutputStream(out).use { it.write(bytes) }
    return out.toByteArray()
}
