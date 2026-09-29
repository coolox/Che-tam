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

class CanaryMonitorService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var eventLog: CanaryEventLog
    private lateinit var lightRunExecutor: CanaryLightRunExecutor

    private val cadenceRunnable = object : Runnable {
        override fun run() {
            runCycle(CanaryWakeupMethod.SERVICE, CanarySchedule.nextSlotAt(System.currentTimeMillis()))
            scheduleServiceCadence()
        }
    }

    override fun onCreate() {
        super.onCreate()
        eventLog = CanaryEventLog(this)
        lightRunExecutor = CanaryLightRunExecutor(this)
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, persistentNotification())
        scheduleServiceCadence()
        CanaryWatchdogScheduler.scheduleNext(this, CanarySchedule.nextSlotAt(System.currentTimeMillis()))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val wakeupMethod = intent?.getStringExtra(EXTRA_WAKEUP_METHOD) ?: CanaryWakeupMethod.SERVICE
        val scheduledAt = intent?.getLongExtra(EXTRA_SCHEDULED_AT, CanarySchedule.nextSlotAt(System.currentTimeMillis()))
            ?: CanarySchedule.nextSlotAt(System.currentTimeMillis())
        runCycle(wakeupMethod, scheduledAt)
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        handler.removeCallbacks(cadenceRunnable)
        CanaryWatchdogScheduler.scheduleNext(this, CanarySchedule.nextSlotAt(System.currentTimeMillis()))
        super.onDestroy()
    }

    private fun scheduleServiceCadence() {
        handler.removeCallbacks(cadenceRunnable)
        handler.postDelayed(cadenceRunnable, CanarySchedule.delayMs(System.currentTimeMillis()))
    }

    private fun runCycle(wakeupMethod: String, scheduledAt: Long) {
        val now = System.currentTimeMillis()
        if (!CanaryRunGate.tryEnter()) {
            eventLog.appendCycleSkipped(wakeupMethod, scheduledAt, (now - scheduledAt).coerceAtLeast(0L))
            return
        }

        val previousScheduledAt = lastScheduledAt()
        setLastScheduledAt(scheduledAt)
        val fields = CanarySystemSnapshot.collect(this, wakeupMethod, scheduledAt, previousScheduledAt)

        try {
            CanaryRunResources(this).use {
                it.acquire()
                eventLog.appendCycleStart(fields)
                val runId = UUID.randomUUID().toString()
                val results = lightRunExecutor.run()
                results.forEach { result ->
                    eventLog.appendLightRunRecord(runId, result)
                }
                eventLog.appendRunSummary(runId, CanaryRunVerdictDeriver.deriveLight(results))
            }
        } finally {
            CanaryRunGate.leave()
            CanaryWatchdogScheduler.scheduleNext(this, scheduledAt + CanarySchedule.SLOT_MS)
        }
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
