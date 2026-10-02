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
import net.hearth.canary.full.CanaryFullRunExecutor
import net.hearth.canary.full.CanaryFullUploadPlanner
import net.hearth.canary.full.CanaryNightlyJournalPlanner
import net.hearth.canary.full.CanaryRunKind
import net.hearth.canary.full.CanaryRunPlanner
import net.hearth.canary.full.CanaryServiceReachDailyPlanner
import net.hearth.canary.full.CanaryTrafficBudget
import net.hearth.canary.light.CanaryLightRunExecutor
import net.hearth.canary.light.CanaryRunVerdictDeriver
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

class CanaryMonitorService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private val cycleExecutor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "canary-light-run").apply { isDaemon = false }
    }
    private var eventLog: CanaryEventLog? = null
    private var lightRunExecutor: CanaryLightRunExecutor? = null
    private var fullRunExecutor: CanaryFullRunExecutor? = null
    private var trafficBudget: CanaryTrafficBudget? = null

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
            fullRunExecutor = CanaryFullRunExecutor(this, CanaryEventJournal(CanaryEventDatabase.get(this).eventDao()))
            trafficBudget = CanaryTrafficBudget(this)
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
        protect("service_on_create_pending_manual_full") {
            drainPendingManualFull()
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
        val runId = UUID.randomUUID().toString()
        val entered = runCatching { CanaryRunGate.tryEnter(runId) }
            .onFailure { appendCycleError("run_gate_enter", it) }
            .getOrDefault(false)
        if (!entered) {
            val queueDecision = CanaryManualFullQueue.onGateBusy(wakeupMethod, hasPendingManualFull())
            setPendingManualFull(queueDecision.pendingAfter)
            if (queueDecision.writeSkipped) {
                appendCycleSkipped(
                    wakeupMethod = wakeupMethod,
                    scheduledAt = scheduledAt,
                    delayMs = (now - scheduledAt).coerceAtLeast(0L),
                    reason = CYCLE_SKIP_REASON_OVERLAP,
                    requestedKind = requestedKind(wakeupMethod, scheduledAt),
                    currentRunId = CanaryRunGate.currentRunId(),
                    queued = queueDecision.queued
                )
            }
            return
        }

        val nextScheduledAt = scheduledAt + CanarySchedule.SLOT_MS
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
                val lightResults = lightRun.results.map { result ->
                    result.copy(networkType = fields?.networkType ?: "unknown")
                }
                lightResults.forEach { result ->
                    appendLightRunRecord(runId, result)
                }
                val requestedRunKind = CanaryRunPlanner.kindForWakeup(wakeupMethod, scheduledAt)
                if (requestedRunKind == CanaryRunKind.FULL) {
                    val budget = requireNotNull(trafficBudget) { "Traffic budget is not initialized" }
                    if (budget.canRunHeavy()) {
                        val nightlyDecision = shouldAttemptNightlyJournalUpload(System.currentTimeMillis())
                        val includeJournalUpload = nightlyDecision.shouldAttempt
                        val includeDailyUpload = CanaryUploadDecision.includeDailyPayload(System.currentTimeMillis())
                        val includeServiceReach = wakeupMethod != CanaryWakeupMethod.MANUAL_FULL &&
                            shouldRunDailyServiceReach(System.currentTimeMillis())
                        val uploadPayloads = CanaryFullUploadPlanner.payloadsForRun(
                            wakeupMethod = wakeupMethod,
                            nowMs = System.currentTimeMillis(),
                            includeDailyUpload = includeDailyUpload
                        )
                        val fullResults = requireNotNull(fullRunExecutor) { "Full run executor is not initialized" }
                            .run(
                                uploadPayloadBytes = uploadPayloads,
                                includeJournalUpload = includeJournalUpload,
                                includeServiceReach = includeServiceReach
                            )
                            .map { result ->
                                result.copy(
                                    networkType = result.networkType ?: fields?.networkType ?: "unknown",
                                    screenOn = result.screenOn ?: fields?.screenOn,
                                    deviceIdleMode = result.deviceIdleMode ?: fields?.deviceIdleMode
                                )
                            }
                        if (includeJournalUpload && fullResults.any { it.testType == "journal_upload" && it.success }) {
                            markNightlyJournalUploadSucceeded(nightlyDecision.localDay)
                        }
                        if (includeServiceReach && fullResults.any { it.testType == "service_reach" }) {
                            markDailyServiceReachAttempted(System.currentTimeMillis())
                        }
                        fullResults.forEach { result ->
                            appendLightRunRecord(runId, result)
                        }
                        val serverBytes = fullResults.sumOf { (it.payloadBytes ?: 0).toLong().coerceAtLeast(0L) }
                        budget.addServerBytes(serverBytes)
                        val fullSummary = CanaryRunVerdictDeriver.deriveLight(lightResults + fullResults, lightRun.traffic).let {
                            it.copy(bytesTx = ((it.bytesTx ?: 0L) + serverBytes).coerceAtLeast(0L))
                        }
                        appendRunSummary(
                            runId,
                            fullSummary,
                            CanaryRunKind.FULL.wireValue
                        )
                    } else {
                        if (budget.markPauseEmitted()) {
                            appendLightRunRecord(
                                runId,
                                net.hearth.canary.light.CanaryTestResult(
                                    testType = "budget_paused",
                                    target = CanaryLightRunExecutor.SERVER_HOST,
                                    success = false,
                                    errorCategory = net.hearth.canary.light.CanaryErrorCategory.OTHER,
                                    errorDetail = "Daily server budget reached",
                                    bytesToday = budget.bytesToday(),
                                    networkType = fields?.networkType ?: "unknown",
                                    runKind = CanaryRunKind.FULL.wireValue
                                )
                            )
                        }
                        appendCycleSkipped(
                            wakeupMethod = wakeupMethod,
                            scheduledAt = scheduledAt,
                            delayMs = (System.currentTimeMillis() - scheduledAt).coerceAtLeast(0L),
                            reason = CYCLE_SKIP_REASON_BUDGET,
                            requestedKind = requestedKind(wakeupMethod, scheduledAt),
                            currentRunId = runId,
                            queued = false
                        )
                        appendRunSummary(
                            runId,
                            CanaryRunVerdictDeriver.deriveLight(lightResults, lightRun.traffic),
                            CanaryRunKind.FULL.wireValue
                        )
                    }
                } else {
                    appendRunSummary(runId, CanaryRunVerdictDeriver.deriveLight(lightResults, lightRun.traffic))
                }
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
            protect("run_cycle_pending_manual_full") {
                drainPendingManualFull()
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

    private fun appendCycleSkipped(
        wakeupMethod: String,
        scheduledAt: Long,
        delayMs: Long,
        reason: String,
        requestedKind: String,
        currentRunId: String?,
        queued: Boolean
    ) {
        runCatching {
            ensureEventLog().appendCycleSkipped(
                wakeupMethod = wakeupMethod,
                scheduledAt = scheduledAt,
                delayMs = delayMs,
                reason = reason,
                requestedKind = requestedKind,
                currentRunId = currentRunId,
                queued = queued
            )
        }
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

    private fun appendRunSummary(runId: String, summary: net.hearth.canary.light.CanaryRunSummary, runKind: String) {
        runCatching { ensureEventLog().appendRunSummary(runId, summary, runKind) }
            .onFailure { appendCycleError("journal_run_summary", it) }
    }

    private fun requestedKind(wakeupMethod: String, scheduledAt: Long): String =
        if (wakeupMethod == CanaryWakeupMethod.MANUAL_FULL) {
            CanaryWakeupMethod.MANUAL_FULL
        } else {
            CanaryRunPlanner.kindForSlot(scheduledAt).wireValue
        }

    private fun drainPendingManualFull() {
        if (!CanaryManualFullQueue.shouldDrain(hasPendingManualFull(), CanaryRunGate.isRunning())) return
        setPendingManualFull(false)
        runCycle(CanaryWakeupMethod.MANUAL_FULL, CanarySchedule.nextSlotAt(System.currentTimeMillis()))
    }

    private fun shouldAttemptNightlyJournalUpload(nowMs: Long): net.hearth.canary.full.CanaryNightlyJournalDecision {
        val prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        return CanaryNightlyJournalPlanner.decide(
            nowMs = nowMs,
            zoneId = ZoneId.systemDefault(),
            lastAttemptDay = prefs.getString(KEY_LAST_NIGHTLY_JOURNAL_SUCCESS_DAY, null),
            jitterProvider = CanaryNightlyJournalPlanner::deterministicJitterMinutes
        )
    }

    private fun markNightlyJournalUploadSucceeded(localDay: String) {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit()
            .putString(KEY_LAST_NIGHTLY_JOURNAL_SUCCESS_DAY, localDay)
            .apply()
    }

    private fun shouldRunDailyServiceReach(nowMs: Long): Boolean =
        CanaryServiceReachDailyPlanner.shouldRun(
            nowMs,
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getString(KEY_LAST_SERVICE_REACH_UTC_DAY, null)
        )

    private fun markDailyServiceReachAttempted(nowMs: Long) {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit()
            .putString(KEY_LAST_SERVICE_REACH_UTC_DAY, CanaryServiceReachDailyPlanner.utcDay(nowMs))
            .apply()
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

    private fun hasPendingManualFull(): Boolean =
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getBoolean(KEY_PENDING_MANUAL_FULL, false)

    private fun setPendingManualFull(pending: Boolean) {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_PENDING_MANUAL_FULL, pending)
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
        private const val KEY_LAST_NIGHTLY_JOURNAL_SUCCESS_DAY = "lastNightlyJournalSuccessDay"
        private const val KEY_LAST_SERVICE_REACH_UTC_DAY = "lastServiceReachUtcDay"
        private const val KEY_PENDING_MANUAL_FULL = "pendingManualFull"
        private const val CYCLE_SKIP_REASON_OVERLAP = "overlap"
        private const val CYCLE_SKIP_REASON_BUDGET = "budget"
    }
}

private object CanaryUploadDecision {
    fun includeDailyPayload(epochMs: Long): Boolean =
        Instant.ofEpochMilli(epochMs).atZone(ZoneOffset.UTC).hour == 0
}
