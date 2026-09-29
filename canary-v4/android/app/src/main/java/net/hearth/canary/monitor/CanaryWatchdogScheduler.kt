package net.hearth.canary.monitor

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

object CanaryWatchdogScheduler {
    fun scheduleNext(
        context: Context,
        expectedCycleAtMs: Long,
        onCycleError: ((String, Throwable) -> Unit)? = null
    ) {
        val triggerAt = expectedCycleAtMs + CanarySchedule.WATCHDOG_GRACE_MS
        try {
            val alarmManager = context.getSystemService(AlarmManager::class.java)
            val intent = Intent(context, CanaryAlarmReceiver::class.java)
                .setAction(CanaryAlarmReceiver.ACTION_WATCHDOG)
                .putExtra(CanaryMonitorService.EXTRA_SCHEDULED_AT, expectedCycleAtMs)
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                REQUEST_CODE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val exactAllowed = runCatching {
                Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
            }.getOrElse { throwable ->
                logCycleError(context, "watchdog_exact_alarm_check", throwable, onCycleError)
                false
            }

            if (exactAllowed) {
                runCatching {
                    alarmManager.setAlarmClock(
                        AlarmManager.AlarmClockInfo(triggerAt, pendingIntent),
                        pendingIntent
                    )
                }.onFailure { throwable ->
                    logCycleError(context, "watchdog_set_alarm_clock", throwable, onCycleError)
                    scheduleInexactFallback(context, alarmManager, triggerAt, pendingIntent, onCycleError)
                }
            } else {
                logCycleError(
                    context,
                    "watchdog_exact_alarm_unavailable",
                    IllegalStateException("Exact alarm permission unavailable; using setAndAllowWhileIdle fallback"),
                    onCycleError
                )
                scheduleInexactFallback(context, alarmManager, triggerAt, pendingIntent, onCycleError)
            }
        } catch (throwable: Throwable) {
            logCycleError(context, "watchdog_schedule_next", throwable, onCycleError)
        }
        runCatching {
            CanaryMonitorState.markWatchdogScheduled(context, expectedCycleAtMs, triggerAt)
        }.onFailure { throwable ->
            logCycleError(context, "watchdog_mark_state", throwable, onCycleError)
        }
    }

    private fun scheduleInexactFallback(
        context: Context,
        alarmManager: AlarmManager,
        triggerAt: Long,
        pendingIntent: PendingIntent,
        onCycleError: ((String, Throwable) -> Unit)?
    ) {
        runCatching {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
        }.onFailure { throwable ->
            logCycleError(context, "watchdog_set_and_allow_while_idle", throwable, onCycleError)
        }
    }

    private fun logCycleError(
        context: Context,
        phase: String,
        throwable: Throwable,
        onCycleError: ((String, Throwable) -> Unit)?
    ) {
        if (onCycleError != null) {
            runCatching { onCycleError(phase, throwable) }
                .onFailure {
                    CanaryCycleErrorReporter.append(context, phase, throwable)
                    CanaryCycleErrorReporter.append(context, "watchdog_cycle_error_logger", it)
                }
        } else {
            CanaryCycleErrorReporter.append(context, phase, throwable)
        }
    }

    private const val REQUEST_CODE = 4015
}
