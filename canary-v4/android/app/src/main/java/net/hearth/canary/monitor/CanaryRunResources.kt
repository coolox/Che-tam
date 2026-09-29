package net.hearth.canary.monitor

import android.content.Context
import android.net.wifi.WifiManager
import android.os.PowerManager

class CanaryRunResources(context: Context) : AutoCloseable {
    private val wakeLock = context.getSystemService(PowerManager::class.java).newWakeLock(
        PowerManager.PARTIAL_WAKE_LOCK,
        "HearthCanary::Cycle"
    )
    private val wifiLock = context.applicationContext.getSystemService(WifiManager::class.java)
        ?.createWifiLock(WifiManager.WIFI_MODE_FULL_LOW_LATENCY, "HearthCanary::CycleWifi")

    fun acquire() {
        wakeLock.acquire(CanarySchedule.WAKE_LOCK_TIMEOUT_MS)
        wifiLock?.setReferenceCounted(false)
        wifiLock?.acquire()
    }

    override fun close() {
        if (wifiLock?.isHeld == true) {
            wifiLock.release()
        }
        if (wakeLock.isHeld) {
            wakeLock.release()
        }
    }
}
