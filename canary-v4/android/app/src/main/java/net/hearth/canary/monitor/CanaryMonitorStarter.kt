package net.hearth.canary.monitor

import android.content.Context
import android.content.Intent
import android.os.Build

object CanaryMonitorStarter {
    fun startFromManual(context: Context) {
        startService(context, CanaryWakeupMethod.MANUAL)
    }

    fun startFromAlarm(context: Context) {
        startService(context, CanaryWakeupMethod.ALARM)
    }

    fun startAfterSystemEvent(context: Context) {
        CanaryWatchdogScheduler.scheduleNext(context, CanarySchedule.nextSlotAt(System.currentTimeMillis()))
        startService(context, CanaryWakeupMethod.BOOT)
    }

    internal fun startService(context: Context, wakeupMethod: String) {
        val appContext = context.applicationContext
        val intent = Intent(appContext, CanaryMonitorService::class.java)
            .setAction(CanaryMonitorService.ACTION_RUN_ONCE)
            .putExtra(CanaryMonitorService.EXTRA_WAKEUP_METHOD, wakeupMethod)

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                appContext.startForegroundService(intent)
            } else {
                appContext.startService(intent)
            }
        } catch (_: IllegalStateException) {
            CanaryWatchdogScheduler.scheduleNext(appContext, CanarySchedule.nextSlotAt(System.currentTimeMillis()))
        } catch (_: SecurityException) {
            CanaryWatchdogScheduler.scheduleNext(appContext, CanarySchedule.nextSlotAt(System.currentTimeMillis()))
        }
    }
}

object CanaryWakeupMethod {
    const val SERVICE = "service"
    const val ALARM = "alarm"
    const val BOOT = "boot"
    const val MANUAL = "manual"
}
