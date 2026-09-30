package net.hearth.canary.light

import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress

enum class CanaryErrorCategory(val wireValue: String) {
    NONE("none"),
    DNS_NXDOMAIN("dns_nxdomain"),
    DNS_TIMEOUT("dns_timeout"),
    DNS_INVALID_ADDRESS("dns_invalid_address"),
    TCP_TIMEOUT("tcp_timeout"),
    TCP_REFUSED("tcp_refused"),
    TCP_RESET("tcp_reset"),
    TLS_TIMEOUT("tls_timeout"),
    TLS_RESET("tls_reset"),
    TLS_HANDSHAKE_ERROR("tls_handshake_error"),
    TLS_PIN_MISMATCH("tls_pin_mismatch"),
    HTTP_ERROR("http_error"),
    WS_UPGRADE_FAILED("ws_upgrade_failed"),
    WS_CLOSED("ws_closed"),
    WS_TIMEOUT("ws_timeout"),
    TURN_ERROR("turn_error"),
    NO_NETWORK("no_network"),
    OTHER("other")
}

enum class CanaryAddressFamily(val wireValue: String) {
    IPV4("ipv4"),
    IPV6("ipv6")
}

data class CanaryPhases(
    val dnsMs: Long? = null,
    val tcpMs: Long? = null,
    val tlsMs: Long? = null,
    val httpMs: Long? = null,
    val upgradeMs: Long? = null
) {
    fun withFailedStage(stage: CanaryPhaseStage): CanaryPhases =
        when (stage) {
            CanaryPhaseStage.DNS -> copy(dnsMs = -1)
            CanaryPhaseStage.TCP -> copy(tcpMs = -1)
            CanaryPhaseStage.TLS -> copy(tlsMs = -1)
            CanaryPhaseStage.HTTP -> copy(httpMs = -1)
            CanaryPhaseStage.UPGRADE -> copy(upgradeMs = -1)
        }
}

enum class CanaryPhaseStage {
    DNS,
    TCP,
    TLS,
    HTTP,
    UPGRADE
}

data class CanaryTestResult(
    val testType: String,
    val target: String,
    val success: Boolean,
    val errorCategory: CanaryErrorCategory,
    val errorDetail: String? = null,
    val exceptionClass: String? = null,
    val latencyMs: Long? = null,
    val phases: CanaryPhases = CanaryPhases(),
    val resolvedIp: String? = null,
    val resolvedAddresses: List<String> = emptyList(),
    val addressFamily: CanaryAddressFamily? = null,
    val previousIp: String? = null,
    val changed: Boolean? = null,
    val httpStatus: Int? = null,
    val networkType: String? = null,
    val bytesTx: Long? = null,
    val bytesRx: Long? = null,
    val connectionId: String? = null,
    val ageSec: Long? = null,
    val sameProcess: Boolean? = null,
    val closeCode: Int? = null,
    val closeReason: String? = null,
    val runKind: String? = null,
    val sni: String? = null,
    val mode: String? = null,
    val provider: String? = null,
    val valuesMs: List<Long> = emptyList(),
    val count: Int? = null,
    val minMs: Long? = null,
    val medianMs: Long? = null,
    val p90Ms: Long? = null,
    val maxMs: Long? = null,
    val lost: Int? = null,
    val connectMs: Long? = null,
    val tlsMs: Long? = null,
    val allocateMs: Long? = null,
    val echoRttMs: Long? = null,
    val echoBytes: Int? = null,
    val throughputKbps: Long? = null,
    val turnErrorCode: Int? = null,
    val payloadBytes: Int? = null,
    val bytesConfirmed: Long? = null,
    val bytesToday: Long? = null
) {
    init {
        require(!success || errorCategory == CanaryErrorCategory.NONE) {
            "Successful test records must use errorCategory=none."
        }
    }
}

data class CanaryRunSummary(
    val testsTotal: Int,
    val testsOk: Int,
    val runVerdict: CanaryRunVerdict,
    val bytesTx: Long? = null,
    val bytesRx: Long? = null
)

data class CanaryWsClosedEvent(
    val timestampUtc: Long,
    val connectionId: String,
    val ageSec: Long,
    val closeCode: Int? = null,
    val exceptionClass: String? = null,
    val networkType: String,
    val screenOn: Boolean?,
    val detectedBy: String
)

enum class CanaryRunVerdict(val wireValue: String) {
    OK("ok"),
    OFFLINE("offline"),
    SERVER_BLOCKED("server_blocked"),
    DNS_ONLY("dns_only"),
    SNI_FILTER("sni_filter"),
    PARTIAL("partial")
}

object CanaryAddressClassifier {
    fun family(address: InetAddress): CanaryAddressFamily? =
        when (address) {
            is Inet4Address -> CanaryAddressFamily.IPV4
            is Inet6Address -> CanaryAddressFamily.IPV6
            else -> null
        }

    fun isInvalidCanaryAddress(address: InetAddress): Boolean {
        val bytes = address.address
        if (address is Inet4Address) {
            val first = bytes[0].toInt() and 0xff
            val second = bytes[1].toInt() and 0xff
            return first == 127 ||
                first == 10 ||
                (first == 192 && second == 168) ||
                (first == 172 && second in 16..31) ||
                bytes.all { it.toInt() == 0 }
        }
        return false
    }
}

object CanaryRunVerdictDeriver {
    fun deriveLight(results: List<CanaryTestResult>, runTraffic: CanaryTrafficSample? = null): CanaryRunSummary {
        val testsOk = results.count { it.success }
        val controlResults = results.filter { it.testType == "control_http" }
        val serverResults = results.filter {
            it.testType == "dns_resolve" ||
                it.testType == "http_domain" ||
                it.testType == "ws_keepalive"
        }
        val controlsOk = controlResults.count { it.success }
        val serverOk = serverResults.count { it.success }
        val verdict = when {
            controlResults.size == 5 && controlsOk == 0 -> CanaryRunVerdict.OFFLINE
            serverResults.isNotEmpty() && serverOk == serverResults.size -> CanaryRunVerdict.OK
            controlsOk > 0 && serverOk == 0 -> CanaryRunVerdict.SERVER_BLOCKED
            else -> CanaryRunVerdict.PARTIAL
        }

        return CanaryRunSummary(
            testsTotal = results.size,
            testsOk = testsOk,
            runVerdict = verdict,
            bytesTx = runTraffic?.bytesTx,
            bytesRx = runTraffic?.bytesRx
        )
    }
}
