package net.hearth.canary.monitor

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

object CanaryWatchdogScheduler {
    fun scheduleNext(context: Context, expectedCycleAtMs: Long) {
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        val triggerAt = expectedCycleAtMs + CanarySchedule.WATCHDOG_GRACE_MS
        val intent = Intent(context, CanaryAlarmReceiver::class.java)
            .setAction(CanaryAlarmReceiver.ACTION_WATCHDOG)
            .putExtra(CanaryMonitorService.EXTRA_SCHEDULED_AT, expectedCycleAtMs)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        alarmManager.setAlarmClock(
            AlarmManager.AlarmClockInfo(triggerAt, pendingIntent),
            pendingIntent
        )
        CanaryMonitorState.markWatchdogScheduled(context, expectedCycleAtMs, triggerAt)
    }

    private const val REQUEST_CODE = 4015
}
