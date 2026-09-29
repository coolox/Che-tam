package net.hearth.canary.monitor

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class CanaryAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != ACTION_WATCHDOG) return

        runCatching {
            val scheduledAt = intent.getLongExtra(
                CanaryMonitorService.EXTRA_SCHEDULED_AT,
                CanarySchedule.nextSlotAt(System.currentTimeMillis())
            )
            runCatching {
                CanaryMonitorStarter.startService(
                    context,
                    CanaryWakeupMethod.ALARM,
                )
            }.onFailure { CanaryCycleErrorReporter.append(context, "alarm_receiver_start_service", it) }
            CanaryWatchdogScheduler.scheduleNext(context, scheduledAt + CanarySchedule.SLOT_MS)
        }.onFailure {
            CanaryCycleErrorReporter.append(context, "alarm_receiver_dispatch", it)
        }
    }

    companion object {
        const val ACTION_WATCHDOG = "net.hearth.canary.monitor.WATCHDOG"
    }
}
