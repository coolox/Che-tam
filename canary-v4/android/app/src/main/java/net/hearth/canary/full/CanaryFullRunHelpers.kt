package net.hearth.canary.full

import net.hearth.canary.light.CanaryAddressClassifier
import org.json.JSONObject
import java.net.InetAddress
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

enum class CanaryRunKind(val wireValue: String) {
    LIGHT("light"),
    FULL("full"),
    UPLOAD("upload")
}

object CanaryRunPlanner {
    fun kindForSlot(scheduledAtMs: Long): CanaryRunKind =
        if (Math.floorMod(scheduledAtMs, 60L * 60L * 1000L) == 0L) CanaryRunKind.FULL else CanaryRunKind.LIGHT
}

object CanaryUploadSchedule {
    fun smallPayloadsForUtcHour(hour: Int): List<Int> =
        if (hour in 0..23 && hour % 6 == 0) listOf(20 * 1024, 120 * 1024, 500 * 1024) else emptyList()

    fun includeDailyPayload(hour: Int): Boolean = hour == 0
}

object CanaryLatencyStats {
    fun aggregate(valuesMs: List<Long>, attempted: Int = 10): LatencyAggregate {
        val sorted = valuesMs.sorted()
        fun percentileIndex(percentile: Double): Int =
            kotlin.math.ceil(sorted.size * percentile).toInt().coerceAtLeast(1) - 1
        return LatencyAggregate(
            count = sorted.size,
            minMs = sorted.firstOrNull(),
            medianMs = sorted.getOrNull(percentileIndex(0.5)),
            p90Ms = sorted.getOrNull(percentileIndex(0.9)),
            maxMs = sorted.lastOrNull(),
            lost = (attempted - sorted.size).coerceAtLeast(0)
        )
    }
}

data class LatencyAggregate(
    val count: Int,
    val minMs: Long?,
    val medianMs: Long?,
    val p90Ms: Long?,
    val maxMs: Long?,
    val lost: Int
)

object CanaryDohParser {
    fun parseValidAddresses(json: String): List<String> {
        val answer = JSONObject(json).optJSONArray("Answer") ?: return emptyList()
        return (0 until answer.length()).mapNotNull { index ->
            val data = answer.optJSONObject(index)?.optString("data").orEmpty()
            runCatching { InetAddress.getByName(data) }.getOrNull()
        }.filterNot(CanaryAddressClassifier::isInvalidCanaryAddress)
            .mapNotNull { it.hostAddress }
    }
}

object CanaryPayloadMetrics {
    fun throughputKbps(bytes: Long, elapsedMs: Long): Long? =
        if (bytes <= 0L || elapsedMs <= 0L) null else ((bytes * 8L * 1000L) / elapsedMs) / 1000L
}

object CanarySecretScrubber {
    private val sensitiveHeader = Regex("(?i)x-canary-key\\s*[:=]\\s*[^\\s,}]+")
    private val turnUsername = Regex("\\b\\d{10,}:hearth-canary\\b")
    private val bearer = Regex("(?i)authorization\\s*[:=]\\s*[^\\s,}]+")

    fun safeError(value: String?): String? =
        value?.replace(sensitiveHeader, "X-Canary-Key=<redacted>")
            ?.replace(bearer, "Authorization=<redacted>")
            ?.replace(turnUsername, "<turn-username>")
            ?.take(200)
}

object CanaryTurnMessage {
    const val MAGIC_COOKIE = 0x2112A442
    const val ATTR_USERNAME = 0x0006
    const val ATTR_MESSAGE_INTEGRITY = 0x0008
    const val ATTR_ERROR_CODE = 0x0009
    const val ATTR_REALM = 0x0014
    const val ATTR_NONCE = 0x0015
    const val ATTR_XOR_PEER_ADDRESS = 0x0012
    const val ATTR_REQUESTED_TRANSPORT = 0x0019
    const val ATTR_LIFETIME = 0x000D
    const val ATTR_DATA = 0x0013

    fun longTermKey(username: String, realm: String, password: String): ByteArray {
        val digest = MessageDigest.getInstance("MD5")
        return digest.digest("$username:$realm:$password".toByteArray(Charsets.UTF_8))
    }

    fun hmacSha1(key: ByteArray, bytes: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA1")
        mac.init(SecretKeySpec(key, "HmacSHA1"))
        return mac.doFinal(bytes)
    }

    fun errorCode(message: ByteArray): Int? {
        attributes(message).firstOrNull { it.type == ATTR_ERROR_CODE }?.let { attr ->
            if (attr.value.size < 4) return null
            val klass = attr.value[2].toInt() and 0x7
            val number = attr.value[3].toInt() and 0xff
            return klass * 100 + number
        }
        return null
    }

    fun stringAttribute(message: ByteArray, type: Int): String? =
        attributes(message).firstOrNull { it.type == type }?.value?.toString(Charsets.UTF_8)

    fun dataAttribute(message: ByteArray): ByteArray? =
        attributes(message).firstOrNull { it.type == ATTR_DATA }?.value

    fun attributes(message: ByteArray): List<StunAttribute> {
        if (message.size < 20) return emptyList()
        val length = u16(message, 2).coerceAtMost(message.size - 20)
        val out = mutableListOf<StunAttribute>()
        var offset = 20
        val end = 20 + length
        while (offset + 4 <= end && offset + 4 <= message.size) {
            val type = u16(message, offset)
            val size = u16(message, offset + 2)
            val valueStart = offset + 4
            val valueEnd = (valueStart + size).coerceAtMost(message.size)
            out += StunAttribute(type, message.copyOfRange(valueStart, valueEnd))
            offset = valueStart + ((size + 3) / 4) * 4
        }
        return out
    }

    private fun u16(bytes: ByteArray, offset: Int): Int =
        ((bytes[offset].toInt() and 0xff) shl 8) or (bytes[offset + 1].toInt() and 0xff)
}

data class StunAttribute(val type: Int, val value: ByteArray)
