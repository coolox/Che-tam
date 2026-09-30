package net.hearth.canary.monitor

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import net.hearth.canary.MainActivity
import net.hearth.canary.R
import net.hearth.canary.light.CanaryLightRunExecutor
import net.hearth.canary.light.CanaryRunVerdictDeriver
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class CanaryMonitorService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private val cycleExecutor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "canary-light-run").apply { isDaemon = false }
    }
    private var eventLog: CanaryEventLog? = null
    private var lightRunExecutor: CanaryLightRunExecutor? = null

    private val cadenceRunnable = object : Runnable {
        override fun run() {
            protect("cadence_runnable") {
                runCycle(CanaryWakeupMethod.SERVICE, CanarySchedule.nextSlotAt(System.currentTimeMillis()))
            }
            protect("cadence_reschedule") {
                scheduleServiceCadence()
            }
        }
    }

    override fun onCreate() {
        try {
            super.onCreate()
        } catch (throwable: Throwable) {
            CanaryCycleErrorReporter.append(this, "service_on_create_super", throwable)
            return
        }
        protect("service_on_create_event_log") {
            eventLog = CanaryEventLog(this)
        }
        protect("service_on_create_executor") {
            lightRunExecutor = CanaryLightRunExecutor(this)
        }
        protect("service_on_create_notification_channel") {
            createNotificationChannel()
        }
        protect("service_on_create_foreground") {
            startForeground(NOTIFICATION_ID, persistentNotification())
        }
        protect("service_on_create_cadence") {
            scheduleServiceCadence()
        }
        protect("service_on_create_watchdog") {
            scheduleWatchdog(CanarySchedule.nextSlotAt(System.currentTimeMillis()))
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        protect("service_on_start_command") {
            val fallbackScheduledAt = CanarySchedule.nextSlotAt(System.currentTimeMillis())
            val wakeupMethod = intent?.getStringExtra(EXTRA_WAKEUP_METHOD) ?: CanaryWakeupMethod.SERVICE
            val scheduledAt = intent?.getLongExtra(EXTRA_SCHEDULED_AT, fallbackScheduledAt)
                ?: fallbackScheduledAt
            runCycle(wakeupMethod, scheduledAt)
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        protect("service_on_destroy") {
            handler.removeCallbacks(cadenceRunnable)
            scheduleWatchdog(CanarySchedule.nextSlotAt(System.currentTimeMillis()))
            cycleExecutor.shutdown()
        }
        runCatching { super.onDestroy() }
            .onFailure { appendCycleError("service_on_destroy_super", it) }
    }

    private fun scheduleServiceCadence() {
        handler.removeCallbacks(cadenceRunnable)
        handler.postDelayed(cadenceRunnable, CanarySchedule.delayMs(System.currentTimeMillis()))
    }

    private fun runCycle(wakeupMethod: String, scheduledAt: Long) {
        val now = System.currentTimeMillis()
        val entered = runCatching { CanaryRunGate.tryEnter() }
            .onFailure { appendCycleError("run_gate_enter", it) }
            .getOrDefault(false)
        if (!entered) {
            appendCycleSkipped(wakeupMethod, scheduledAt, (now - scheduledAt).coerceAtLeast(0L))
            return
        }

        val nextScheduledAt = scheduledAt + CanarySchedule.SLOT_MS
        val runId = UUID.randomUUID().toString()
        val cycleTimestampUtc = System.currentTimeMillis()

        try {
            cycleExecutor.execute {
                runCycleInBackground(wakeupMethod, scheduledAt, nextScheduledAt, runId, cycleTimestampUtc)
            }
        } catch (throwable: Throwable) {
            appendCycleError("run_cycle_dispatch", throwable)
            runCatching { CanaryRunGate.leave() }
                .onFailure { appendCycleError("run_gate_leave", it) }
        }
    }

    private fun runCycleInBackground(
        wakeupMethod: String,
        scheduledAt: Long,
        nextScheduledAt: Long,
        runId: String,
        cycleTimestampUtc: Long
    ) {
        try {
            val previousScheduledAt = runCatching { lastScheduledAt() }
                .onFailure { appendCycleError("run_last_scheduled_at", it) }
                .getOrNull()
            runCatching { setLastScheduledAt(scheduledAt) }
                .onFailure { appendCycleError("run_set_last_scheduled_at", it) }
            val fields = runCatching {
                CanarySystemSnapshot.collect(
                    this,
                    wakeupMethod,
                    scheduledAt,
                    previousScheduledAt,
                    runId,
                    cycleTimestampUtc
                )
            }.onFailure {
                appendCycleError("run_system_snapshot", it)
            }.getOrNull()

            var resources: CanaryRunResources? = null
            try {
                resources = CanaryRunResources(this)
                resources.acquire()
                if (fields != null) {
                    appendCycleStart(fields)
                }
                val lightRun = requireNotNull(lightRunExecutor) { "Light run executor is not initialized" }.run()
                val results = lightRun.results.map { result ->
                    result.copy(networkType = fields?.networkType ?: "unknown")
                }
                results.forEach { result ->
                    appendLightRunRecord(runId, result)
                }
                appendRunSummary(runId, CanaryRunVerdictDeriver.deriveLight(results, lightRun.traffic))
            } catch (throwable: Throwable) {
                appendCycleError("run_cycle_body", throwable)
            } finally {
                runCatching { resources?.close() }
                    .onFailure { appendCycleError("run_resources_release", it) }
            }
        } catch (throwable: Throwable) {
            appendCycleError("run_cycle", throwable)
        } finally {
            runCatching { CanaryRunGate.leave() }
                .onFailure { appendCycleError("run_gate_leave", it) }
            protect("run_cycle_watchdog_reschedule") {
                scheduleWatchdog(nextScheduledAt)
            }
        }
    }

    private fun scheduleWatchdog(expectedCycleAtMs: Long) {
        CanaryWatchdogScheduler.scheduleNext(this, expectedCycleAtMs, ::appendCycleError)
    }

    private fun protect(phase: String, block: () -> Unit) {
        try {
            block()
        } catch (throwable: Throwable) {
            appendCycleError(phase, throwable)
        }
    }

    private fun appendCycleStart(fields: CycleStartFields) {
        runCatching { ensureEventLog().appendCycleStart(fields) }
            .onFailure { appendCycleError("journal_cycle_start", it) }
    }

    private fun appendCycleSkipped(wakeupMethod: String, scheduledAt: Long, delayMs: Long) {
        runCatching { ensureEventLog().appendCycleSkipped(wakeupMethod, scheduledAt, delayMs) }
            .onFailure { appendCycleError("journal_cycle_skipped", it) }
    }

    private fun appendLightRunRecord(runId: String, result: net.hearth.canary.light.CanaryTestResult) {
        runCatching { ensureEventLog().appendLightRunRecord(runId, result) }
            .onFailure { appendCycleError("journal_light_run_record", it) }
    }

    private fun appendRunSummary(runId: String, summary: net.hearth.canary.light.CanaryRunSummary) {
        runCatching { ensureEventLog().appendRunSummary(runId, summary) }
            .onFailure { appendCycleError("journal_run_summary", it) }
    }

    private fun appendCycleError(phase: String, throwable: Throwable) {
        runCatching { ensureEventLog().appendCycleError(phase, throwable) }
            .onFailure { CanaryCycleErrorReporter.append(this, phase, throwable) }
    }

    private fun ensureEventLog(): CanaryEventLog {
        eventLog?.let { return it }
        return CanaryEventLog(this).also { eventLog = it }
    }

    private fun lastScheduledAt(): Long? {
        val value = getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getLong(KEY_LAST_SCHEDULED_AT, Long.MIN_VALUE)
        return if (value == Long.MIN_VALUE) null else value
    }

    private fun setLastScheduledAt(scheduledAt: Long) {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit()
            .putLong(KEY_LAST_SCHEDULED_AT, scheduledAt)
            .apply()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val channel = NotificationChannel(
            NOTIFICATION_CHANNEL_ID,
            getString(R.string.monitor_notification_channel),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun persistentNotification(): Notification {
        val activityIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
        } else {
            Notification.Builder(this)
        }

        return builder
            .setContentTitle(getString(R.string.monitor_notification_title))
            .setContentText(getString(R.string.monitor_notification_text))
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .setContentIntent(activityIntent)
            .build()
    }

    companion object {
        const val ACTION_RUN_ONCE = "net.hearth.canary.monitor.RUN_ONCE"
        const val EXTRA_WAKEUP_METHOD = "net.hearth.canary.monitor.WAKEUP_METHOD"
        const val EXTRA_SCHEDULED_AT = "net.hearth.canary.monitor.SCHEDULED_AT"

        private const val NOTIFICATION_ID = 4001
        private const val NOTIFICATION_CHANNEL_ID = "canary_monitor"
        private const val PREFS_NAME = "canary_monitor"
        private const val KEY_LAST_SCHEDULED_AT = "lastScheduledAt"
    }
}
