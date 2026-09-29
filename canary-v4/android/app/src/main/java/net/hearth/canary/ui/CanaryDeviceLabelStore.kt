package net.hearth.canary.ui

import android.content.Context

object CanaryDeviceLabelStore {
    fun get(context: Context): String {
        val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val stored = prefs.getString(KEY_DEVICE_LABEL, null)?.takeIf { it.isNotBlank() }
        if (stored != null) return stored
        prefs.edit().putString(KEY_DEVICE_LABEL, DEFAULT_LABEL).apply()
        return DEFAULT_LABEL
    }

    fun set(context: Context, value: String): String {
        val normalized = value.trim().ifBlank { DEFAULT_LABEL }
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_DEVICE_LABEL, normalized)
            .apply()
        return normalized
    }

    const val DEFAULT_LABEL = "local-1"
    private const val PREFS_NAME = "canary_device"
    private const val KEY_DEVICE_LABEL = "deviceLabel"
}
