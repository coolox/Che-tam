package net.hearth.canary.monitor

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiInfo
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.os.SystemClock

object CanarySystemSnapshot {
    val processStartedAt: Long = System.currentTimeMillis() - SystemClock.elapsedRealtime()

    fun collect(
        context: Context,
        wakeupMethod: String,
        scheduledAt: Long,
        previousScheduledAt: Long?,
        runId: String,
        timestampUtc: Long
    ): CycleStartFields {
        val now = System.currentTimeMillis()
        val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val status = battery?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val plugged = battery?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0
        val powerManager = context.getSystemService(PowerManager::class.java)
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        val notificationManager = context.getSystemService(NotificationManager::class.java)
        val networkSnapshot = collectNetworkSnapshot(context)

        return CycleStartFields(
            runId = runId,
            timestampUtc = timestampUtc,
            wakeupMethod = wakeupMethod,
            scheduledAt = scheduledAt,
            delayMs = (now - scheduledAt).coerceAtLeast(0L),
            missedSinceLast = CanarySchedule.missedSinceLast(previousScheduledAt, scheduledAt),
            batteryPct = if (level >= 0 && scale > 0) level * 100 / scale else null,
            isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL ||
                plugged != 0,
            batteryOptimizationIgnored = powerManager.isIgnoringBatteryOptimizations(context.packageName),
            screenOn = powerManager.isInteractive,
            deviceIdleMode = powerManager.isDeviceIdleMode,
            powerSaveMode = powerManager.isPowerSaveMode,
            appStandbyBucket = collectAppStandbyBucket(context),
            exactAlarmAllowed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                alarmManager.canScheduleExactAlarms()
            } else {
                true
            },
            notificationsAllowed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                context.checkPermission(
                    Manifest.permission.POST_NOTIFICATIONS,
                    Process.myPid(),
                    Process.myUid()
                ) == PackageManager.PERMISSION_GRANTED
            } else {
                notificationManager.areNotificationsEnabled()
            },
            uptimeSec = SystemClock.elapsedRealtime() / 1000L,
            processStartedAt = processStartedAt,
            networkType = networkSnapshot.networkType,
            wifiRssi = networkSnapshot.wifiRssi,
            wifiLinkMbps = networkSnapshot.wifiLinkMbps,
            gmsAvailable = isPackageAvailable(context, "com.google.android.gms")
        )
    }

    private fun collectNetworkSnapshot(context: Context): NetworkSnapshot {
        val connectivityManager = context.getSystemService(ConnectivityManager::class.java)
            ?: return NetworkSnapshot(networkType = "unknown")
        val capabilities = runCatching {
            connectivityManager.getNetworkCapabilities(connectivityManager.activeNetwork)
        }.getOrNull()
            ?: return NetworkSnapshot(networkType = "unknown")

        val wifiInfo = transportWifiInfo(capabilities)
        return CanaryNetworkSnapshotExtractor.fromCapabilities(
            hasWifi = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI),
            hasCellular = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR),
            wifiRssi = wifiInfo?.rssi,
            wifiLinkMbps = wifiInfo?.linkSpeed
        )
    }

    private fun transportWifiInfo(capabilities: NetworkCapabilities): WifiInfo? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            runCatching { capabilities.transportInfo as? WifiInfo }.getOrNull()
        } else {
            null
        }

    private fun collectAppStandbyBucket(context: Context): Int? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            runCatching {
                context.getSystemService(UsageStatsManager::class.java)?.appStandbyBucket
            }.getOrNull()
        } else {
            null
        }

    internal fun collectWsState(context: Context): CanaryWsDeviceState {
        val powerManager = context.getSystemService(PowerManager::class.java)
        val networkSnapshot = collectNetworkSnapshot(context)
        return CanaryWsDeviceState(
            networkType = networkSnapshot.networkType,
            screenOn = powerManager?.isInteractive
        )
    }

    internal fun isPackageAvailable(context: Context, packageName: String): Boolean =
        runCatching {
            context.packageManager.getPackageInfo(packageName, 0)
            true
        }.getOrDefault(false)
}

internal data class NetworkSnapshot(
    val networkType: String,
    val wifiRssi: Int? = null,
    val wifiLinkMbps: Int? = null
)

internal data class CanaryWsDeviceState(
    val networkType: String,
    val screenOn: Boolean?
)

internal object CanaryNetworkSnapshotExtractor {
    fun fromCapabilities(
        hasWifi: Boolean,
        hasCellular: Boolean,
        wifiRssi: Int?,
        wifiLinkMbps: Int?
    ): NetworkSnapshot {
        val networkType = when {
            hasWifi -> "wifi"
            hasCellular -> "cellular"
            else -> "other"
        }
        return NetworkSnapshot(
            networkType = networkType,
            wifiRssi = wifiRssi.takeIf { hasWifi },
            wifiLinkMbps = wifiLinkMbps.takeIf { hasWifi }
        )
    }
}
