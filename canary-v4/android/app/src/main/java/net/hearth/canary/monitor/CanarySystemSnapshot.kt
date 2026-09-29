package net.hearth.canary.monitor

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.wifi.WifiManager
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
        previousScheduledAt: Long?
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
        val wifiManager = context.applicationContext.getSystemService(WifiManager::class.java)
        val wifiInfo = wifiManager?.connectionInfo

        return CycleStartFields(
            wakeupMethod = wakeupMethod,
            scheduledAt = scheduledAt,
            delayMs = (now - scheduledAt).coerceAtLeast(0L),
            missedSinceLast = CanarySchedule.missedSinceLast(previousScheduledAt, scheduledAt),
            batteryPct = if (level >= 0 && scale > 0) level * 100 / scale else null,
            isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL ||
                plugged != 0,
            batteryOptimizationIgnored = powerManager.isIgnoringBatteryOptimizations(context.packageName),
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
            wifiRssi = wifiInfo?.rssi,
            wifiLinkMbps = wifiInfo?.linkSpeed
        )
    }
}
