package net.hearth.canary.full

import net.hearth.canary.light.CanaryAddressClassifier
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.InetAddress
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.zip.CRC32
import java.util.Base64
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

    fun kindForWakeup(wakeupMethod: String, scheduledAtMs: Long): CanaryRunKind =
        if (wakeupMethod == "manual_full") CanaryRunKind.FULL else kindForSlot(scheduledAtMs)
}

object CanaryUploadSchedule {
    fun smallPayloadsForUtcHour(hour: Int): List<Int> =
        if (hour in 0..23 && hour % 6 == 0) listOf(20 * 1024, 120 * 1024, 500 * 1024) else emptyList()

    fun includeDailyPayload(hour: Int): Boolean = hour == 0
}

object CanaryFullUploadPlanner {
    const val MANUAL_PAYLOAD_BYTES = 120 * 1024

    fun payloadsForRun(wakeupMethod: String, nowMs: Long, includeDailyUpload: Boolean): List<Int> {
        if (wakeupMethod == "manual_full") return listOf(MANUAL_PAYLOAD_BYTES)
        val utcHour = Instant.ofEpochMilli(nowMs).atZone(java.time.ZoneOffset.UTC).hour
        return CanaryUploadSchedule.smallPayloadsForUtcHour(utcHour) +
            if (includeDailyUpload) listOf(2 * 1024 * 1024) else emptyList()
    }
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

data class CanaryNightlyJournalDecision(
    val shouldAttempt: Boolean,
    val localDay: String,
    val scheduledAtMs: Long
)

object CanaryNightlyJournalPlanner {
    private const val WINDOW_MINUTES = 30

    fun decide(nowMs: Long, zoneId: ZoneId, lastAttemptDay: String?, jitterProvider: (String) -> Int): CanaryNightlyJournalDecision {
        val local = Instant.ofEpochMilli(nowMs).atZone(zoneId)
        val localDay = local.toLocalDate().toString()
        val scheduledAt = scheduledAtMs(LocalDate.parse(localDay), zoneId, jitterProvider(localDay))
        return CanaryNightlyJournalDecision(
            shouldAttempt = lastAttemptDay != localDay && nowMs >= scheduledAt,
            localDay = localDay,
            scheduledAtMs = scheduledAt
        )
    }

    fun deterministicJitterMinutes(localDay: String): Int {
        val crc = CRC32()
        crc.update(localDay.toByteArray(Charsets.UTF_8))
        return (crc.value % (WINDOW_MINUTES + 1)).toInt()
    }

    private fun scheduledAtMs(day: LocalDate, zoneId: ZoneId, jitterMinutes: Int): Long =
        day.atTime(3, 0)
            .plusMinutes(jitterMinutes.coerceIn(0, WINDOW_MINUTES).toLong())
            .atZone(zoneId)
            .toInstant()
            .toEpochMilli()
}

data class LatencyAggregate(
    val count: Int,
    val minMs: Long?,
    val medianMs: Long?,
    val p90Ms: Long?,
    val maxMs: Long?,
    val lost: Int
)

object CanaryDohMessage {
    const val TYPE_A = 1
    const val TYPE_AAAA = 28
    private const val CLASS_IN = 1

    fun queryParam(host: String, type: Int = TYPE_A): String =
        Base64.getUrlEncoder().withoutPadding().encodeToString(query(host, type))

    fun query(host: String, type: Int = TYPE_A, id: Int = 0x4843): ByteArray {
        val out = ByteArrayOutputStream()
        writeU16(out, id)
        writeU16(out, 0x0100)
        writeU16(out, 1)
        writeU16(out, 0)
        writeU16(out, 0)
        writeU16(out, 0)
        host.trim('.').split('.').filter(String::isNotBlank).forEach { label ->
            require(label.length in 1..63) { "Invalid DNS label length." }
            val bytes = label.toByteArray(Charsets.UTF_8)
            out.write(bytes.size)
            out.write(bytes)
        }
        out.write(0)
        writeU16(out, type)
        writeU16(out, CLASS_IN)
        return out.toByteArray()
    }

    fun parseValidAddresses(message: ByteArray): List<String> {
        if (message.size < 12) return emptyList()
        val questionCount = u16(message, 4)
        val answerCount = u16(message, 6)
        var offset = 12
        repeat(questionCount) {
            offset = skipName(message, offset) ?: return emptyList()
            if (offset + 4 > message.size) return emptyList()
            offset += 4
        }
        val addresses = mutableListOf<InetAddress>()
        repeat(answerCount) {
            offset = skipName(message, offset) ?: return emptyList()
            if (offset + 10 > message.size) return emptyList()
            val type = u16(message, offset)
            val klass = u16(message, offset + 2)
            val size = u16(message, offset + 8)
            val dataOffset = offset + 10
            val dataEnd = dataOffset + size
            if (dataEnd > message.size) return emptyList()
            if (klass == CLASS_IN && ((type == TYPE_A && size == 4) || (type == TYPE_AAAA && size == 16))) {
                addresses += InetAddress.getByAddress(message.copyOfRange(dataOffset, dataEnd))
            }
            offset = dataEnd
        }
        return addresses.filterNot(CanaryAddressClassifier::isInvalidCanaryAddress)
            .mapNotNull { it.hostAddress }
    }

    private fun skipName(message: ByteArray, start: Int): Int? {
        var offset = start
        var jumps = 0
        while (offset < message.size) {
            val length = message[offset].toInt() and 0xff
            if (length == 0) return offset + 1
            if ((length and 0xC0) == 0xC0) {
                if (offset + 1 >= message.size || jumps++ > 8) return null
                return offset + 2
            }
            if ((length and 0xC0) != 0) return null
            if (offset + 1 + length > message.size) return null
            offset += 1 + length
        }
        return null
    }

    private fun u16(bytes: ByteArray, offset: Int): Int =
        ((bytes[offset].toInt() and 0xff) shl 8) or (bytes[offset + 1].toInt() and 0xff)

    private fun writeU16(out: ByteArrayOutputStream, value: Int) {
        out.write((value ushr 8) and 0xff)
        out.write(value and 0xff)
    }
}

object CanaryTurnCredentialParser {
    private const val MAX_TTL_SEC = 24 * 60 * 60
    private val usernamePattern = Regex("^([1-9][0-9]*):(.+)$")

    fun parse(json: String, nowEpochSec: Long): TurnCredential {
        val obj = JSONObject(json)
        val username = obj.optString("username").trim()
        val password = listOf(obj.optString("credential"), obj.optString("password"))
            .firstOrNull { it.isNotBlank() }
            ?.trim()
            ?: error("TURN credential response missing credential")
        val ttlSec = obj.optLong("ttlSec", -1L)
        validate(username, ttlSec, nowEpochSec)
        return TurnCredential(username = username, password = password, ttlSec = ttlSec)
    }

    private fun validate(username: String, ttlSec: Long, nowEpochSec: Long) {
        val match = usernamePattern.matchEntire(username)
            ?: error("TURN credential username is not expiry-prefixed")
        val expiresAt = match.groupValues[1].toLongOrNull()
            ?: error("TURN credential username expiry is invalid")
        check(match.groupValues[2].isNotBlank()) { "TURN credential username suffix is empty" }
        check(ttlSec in 1..MAX_TTL_SEC) { "TURN credential ttlSec is invalid" }
        check(expiresAt > nowEpochSec) { "TURN credential is expired" }
    }
}

data class TurnCredential(val username: String, val password: String, val ttlSec: Long)

data class CanaryHeartbeatStatusState(
    val intervalSec: Int,
    val connectedAtMs: Long,
    val pingsSent: Int = 0,
    val pongsMissed: Int = 0,
    val alive: Boolean = true
) {
    fun ageSec(nowMs: Long): Long = ((nowMs - connectedAtMs).coerceAtLeast(0L)) / 1000L
    fun sentPing(missed: Boolean): CanaryHeartbeatStatusState =
        copy(
            pingsSent = pingsSent + 1,
            pongsMissed = pongsMissed + if (missed) 1 else 0,
            alive = !missed
        )

    fun dead(): CanaryHeartbeatStatusState = copy(alive = false)
}

object CanaryHeartbeatPayload {
    fun disconnectAfterSec(intervalSec: Int): Int =
        kotlin.math.round(intervalSec * 2.5).toInt()

    fun text(intervalSec: Int, connectionId: String, sentAtMs: Long): String =
        JSONObject()
            .put("type", "ws_heartbeat")
            .put("intervalSec", intervalSec)
            .put("disconnectAfterSec", disconnectAfterSec(intervalSec))
            .put("connectionId", connectionId)
            .put("sentAtMs", sentAtMs)
            .toString()
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

object CanaryServiceReachUiErrorSummary {
    fun format(value: String?): String? =
        CanarySecretScrubber.safeError(value)
            ?.replace(Regex("\\s+"), " ")
            ?.take(120)
}

object CanaryTurnMessage {
    const val MAGIC_COOKIE = 0x2112A442
    const val METHOD_ALLOCATE = 0x0003
    const val METHOD_CREATE_PERMISSION = 0x0008
    const val METHOD_SEND = 0x0016
    const val METHOD_DATA = 0x0017
    const val CLASS_SUCCESS = 0x0100
    const val CLASS_ERROR = 0x0110
    const val ATTR_USERNAME = 0x0006
    const val ATTR_MESSAGE_INTEGRITY = 0x0008
    const val ATTR_ERROR_CODE = 0x0009
    const val ATTR_REALM = 0x0014
    const val ATTR_NONCE = 0x0015
    const val ATTR_XOR_PEER_ADDRESS = 0x0012
    const val ATTR_REQUESTED_TRANSPORT = 0x0019
    const val ATTR_LIFETIME = 0x000D
    const val ATTR_DATA = 0x0013
    private const val REQUESTED_TRANSPORT_UDP = 17 shl 24
    private val random = SecureRandom()

    fun allocateChallenge(transactionId: ByteArray = transactionId()): ByteArray =
        build(METHOD_ALLOCATE, transactionId, listOf(u32Attribute(ATTR_REQUESTED_TRANSPORT, REQUESTED_TRANSPORT_UDP)))

    fun allocateAuthenticated(username: String, realm: String, nonce: String, password: String, transactionId: ByteArray = transactionId()): ByteArray =
        buildAuthenticated(
            METHOD_ALLOCATE,
            transactionId,
            username,
            realm,
            nonce,
            password,
            listOf(u32Attribute(ATTR_REQUESTED_TRANSPORT, REQUESTED_TRANSPORT_UDP))
        )

    fun createPermission(username: String, realm: String, nonce: String, password: String, peerHost: String, peerPort: Int, transactionId: ByteArray = transactionId()): ByteArray =
        buildAuthenticated(
            METHOD_CREATE_PERMISSION,
            transactionId,
            username,
            realm,
            nonce,
            password,
            listOf(xorPeerAddress(peerHost, peerPort))
        )

    fun sendIndication(peerHost: String, peerPort: Int, payload: ByteArray, transactionId: ByteArray = transactionId()): ByteArray =
        build(
            METHOD_SEND,
            transactionId,
            listOf(xorPeerAddress(peerHost, peerPort), attribute(ATTR_DATA, payload))
        )

    fun type(message: ByteArray): Int? =
        if (message.size >= 2) u16(message, 0) else null

    fun isSuccess(message: ByteArray, method: Int): Boolean = type(message) == (CLASS_SUCCESS or method)

    fun isError(message: ByteArray, method: Int): Boolean = type(message) == (CLASS_ERROR or method)

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

    private fun buildAuthenticated(
        type: Int,
        transactionId: ByteArray,
        username: String,
        realm: String,
        nonce: String,
        password: String,
        attrs: List<StunAttribute>
    ): ByteArray {
        val authAttrs = attrs + listOf(
            attribute(ATTR_USERNAME, username.toByteArray(Charsets.UTF_8)),
            attribute(ATTR_REALM, realm.toByteArray(Charsets.UTF_8)),
            attribute(ATTR_NONCE, nonce.toByteArray(Charsets.UTF_8))
        )
        val withoutIntegrity = build(type, transactionId, authAttrs, extraLength = 24)
        val hmac = hmacSha1(longTermKey(username, realm, password), withoutIntegrity)
        return build(type, transactionId, authAttrs + attribute(ATTR_MESSAGE_INTEGRITY, hmac))
    }

    private fun build(type: Int, transactionId: ByteArray, attrs: List<StunAttribute>, extraLength: Int = 0): ByteArray {
        require(transactionId.size == 12) { "STUN transaction id must be 12 bytes." }
        val body = ByteArrayOutputStream()
        attrs.forEach { attr ->
            writeU16(body, attr.type)
            writeU16(body, attr.value.size)
            body.write(attr.value)
            repeat(padding(attr.value.size)) { body.write(0) }
        }
        val bodyBytes = body.toByteArray()
        val out = ByteArrayOutputStream()
        writeU16(out, type)
        writeU16(out, bodyBytes.size + extraLength)
        writeU32(out, MAGIC_COOKIE)
        out.write(transactionId)
        out.write(bodyBytes)
        return out.toByteArray()
    }

    private fun attribute(type: Int, value: ByteArray): StunAttribute = StunAttribute(type, value)

    private fun u32Attribute(type: Int, value: Int): StunAttribute {
        val out = ByteArrayOutputStream()
        writeU32(out, value)
        return attribute(type, out.toByteArray())
    }

    private fun xorPeerAddress(host: String, port: Int): StunAttribute {
        val address = InetAddress.getByName(host).address
        require(address.size == 4) { "Only IPv4 TURN echo peer is supported." }
        val out = ByteArrayOutputStream()
        out.write(0)
        out.write(0x01)
        writeU16(out, port xor (MAGIC_COOKIE ushr 16))
        val cookie = byteArrayOf(
            ((MAGIC_COOKIE ushr 24) and 0xff).toByte(),
            ((MAGIC_COOKIE ushr 16) and 0xff).toByte(),
            ((MAGIC_COOKIE ushr 8) and 0xff).toByte(),
            (MAGIC_COOKIE and 0xff).toByte()
        )
        address.forEachIndexed { index, byte -> out.write(byte.toInt() xor cookie[index].toInt()) }
        return attribute(ATTR_XOR_PEER_ADDRESS, out.toByteArray())
    }

    private fun transactionId(): ByteArray = ByteArray(12).also(random::nextBytes)

    private fun padding(size: Int): Int = (4 - (size % 4)) % 4

    private fun u16(bytes: ByteArray, offset: Int): Int =
        ((bytes[offset].toInt() and 0xff) shl 8) or (bytes[offset + 1].toInt() and 0xff)

    private fun writeU16(out: ByteArrayOutputStream, value: Int) {
        out.write((value ushr 8) and 0xff)
        out.write(value and 0xff)
    }

    private fun writeU32(out: ByteArrayOutputStream, value: Int) {
        out.write((value ushr 24) and 0xff)
        out.write((value ushr 16) and 0xff)
        out.write((value ushr 8) and 0xff)
        out.write(value and 0xff)
    }
}

data class StunAttribute(val type: Int, val value: ByteArray)
