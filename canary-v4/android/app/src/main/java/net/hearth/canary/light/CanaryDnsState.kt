package net.hearth.canary.light

import android.content.Context

class CanaryDnsState(context: Context) {
    private val prefs = context.getSharedPreferences("canary_dns_state", Context.MODE_PRIVATE)

    fun previousIp(host: String, currentIp: String?): String? {
        val values = prefs.getString(key(host), null)
            ?.split(",")
            ?.filter(String::isNotBlank)
            .orEmpty()
        return values.firstOrNull { it != currentIp } ?: values.firstOrNull()
    }

    fun remember(host: String, addresses: List<String>) {
        if (addresses.isEmpty()) return
        val existing = prefs.getString(key(host), null)
            ?.split(",")
            ?.filter(String::isNotBlank)
            .orEmpty()
        val merged = (addresses + existing).distinct().take(MAX_ADDRESSES)
        prefs.edit().putString(key(host), merged.joinToString(",")).apply()
    }

    private fun key(host: String): String = "addresses.$host"

    companion object {
        private const val MAX_ADDRESSES = 10
    }
}
