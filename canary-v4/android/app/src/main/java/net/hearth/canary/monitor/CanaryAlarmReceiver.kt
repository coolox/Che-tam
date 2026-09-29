package net.hearth.canary.monitor

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class CanaryAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != ACTION_WATCHDOG) return

        val scheduledAt = intent.getLongExtra(
            CanaryMonitorService.EXTRA_SCHEDULED_AT,
            CanarySchedule.nextSlotAt(System.currentTimeMillis())
        )
        CanaryMonitorStarter.startService(
            context,
            CanaryWakeupMethod.ALARM,
        )
        CanaryWatchdogScheduler.scheduleNext(context, scheduledAt + CanarySchedule.SLOT_MS)
    }

    companion object {
        const val ACTION_WATCHDOG = "net.hearth.canary.monitor.WATCHDOG"
    }
}
