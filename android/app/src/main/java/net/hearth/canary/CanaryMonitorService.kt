package net.hearth.canary

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Visible, opt-in foreground monitor with an inexact WorkManager recovery fallback. */
class CanaryMonitorService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val executor = Executors.newSingleThreadExecutor()
  private val probeRunnable = object : Runnable {
    override fun run() {
      runScheduledCycle(this@CanaryMonitorService, "native_service")
      handler.postDelayed(this, INTERVAL_MS)
    }
  }

  override fun onCreate() {
    super.onCreate()
    serviceRunning = true
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().putBoolean(ACTIVE_KEY, true).commit()
    publishNotification(this)
    scheduleFallback(this)
    handler.removeCallbacks(probeRunnable)
    executor.execute { runScheduledCycle(this, "native_service") }
    handler.postDelayed(probeRunnable, INTERVAL_MS)
    return START_STICKY
  }

  override fun onDestroy() {
    serviceRunning = false
    getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().putBoolean(ACTIVE_KEY, false).commit()
    handler.removeCallbacks(probeRunnable)
    executor.shutdownNow()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun runScheduledCycle(context: Context, source: String) {
    executor.execute { runNativeCycle(context, source) }
  }

  companion object {
    const val CHANNEL_ID = "hearth_canary_monitor"
    const val NOTIFICATION_ID = 1001
    const val PREFERENCES = "hearth_canary_monitor"
    const val QUEUE_KEY = "records"
    const val ACTIVE_KEY = "active"
    const val INTERVAL_MS = 15 * 60 * 1000L
    const val FALLBACK_WORK_NAME = "hearth_canary_workmanager_fallback"
    internal val queueLock = Any()
    @Volatile private var serviceRunning = false

    /** Runs at most one native cycle across Android components and persists scheduling evidence. */
    fun runNativeCycle(context: Context, source: String): List<org.json.JSONObject>? {
      val schedule = CanaryScheduleState(context)
      if (!schedule.acquireLease()) return null
      val startedMs = System.currentTimeMillis()
      try {
        val missed = schedule.missedCycleRecords(startedMs, source)
        if (missed.isNotEmpty()) CanaryProbeRunner.appendResults(context, missed)
        schedule.recordCycleStarted(startedMs)
        val records = CanaryProbeRunner(context, source).runAndPersist()
        schedule.recordCycleCompleted(System.currentTimeMillis())
        publishNotification(context)
        return records
      } finally {
        schedule.releaseLease()
      }
    }

    fun isServiceRunning(): Boolean = serviceRunning

    fun isMarkedActive(context: Context): Boolean =
      context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getBoolean(ACTIVE_KEY, false)

    fun scheduleFallback(context: Context) {
      val request = PeriodicWorkRequestBuilder<CanaryMonitorWorker>(15, TimeUnit.MINUTES).build()
      WorkManager.getInstance(context).enqueueUniquePeriodicWork(FALLBACK_WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
    }

    fun cancelFallback(context: Context) {
      WorkManager.getInstance(context).cancelUniqueWork(FALLBACK_WORK_NAME)
    }

    fun publishNotification(context: Context) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(
          NotificationChannel(CHANNEL_ID, "Hearth Canary", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Видимый мониторинг доступности Hearth"
            setShowBadge(false)
          },
        )
      }
      val pendingIntent = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      val text = "Мониторинг активен; ${CanaryScheduleState(context).notificationStatus()}"
      val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, CHANNEL_ID) else Notification.Builder(context)
      val notification = builder.setSmallIcon(android.R.drawable.stat_notify_sync).setContentTitle("Hearth Canary").setContentText(text).setContentIntent(pendingIntent).setOngoing(true).build()
      val notificationManager = context.getSystemService(NotificationManager::class.java)
      if (context is Service) context.startForeground(NOTIFICATION_ID, notification) else notificationManager.notify(NOTIFICATION_ID, notification)
    }
  }
}
