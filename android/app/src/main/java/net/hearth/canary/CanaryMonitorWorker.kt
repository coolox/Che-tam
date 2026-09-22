package net.hearth.canary

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.work.Worker
import androidx.work.WorkerParameters

/** Inexact WorkManager recovery signal. The foreground service owns probe cadence. */
class CanaryMonitorWorker(appContext: Context, params: WorkerParameters) : Worker(appContext, params) {
  override fun doWork(): Result = try {
    if (CanaryMonitorService.isMarkedActive(applicationContext)) {
      if (!CanaryMonitorService.isServiceRunning()) {
        val serviceIntent = Intent(applicationContext, CanaryMonitorService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) applicationContext.startForegroundService(serviceIntent) else applicationContext.startService(serviceIntent)
      }
      // The foreground service owns cadence; this worker only recovers it after process loss.
      Result.success()
    } else {
      // The user stopped monitoring; a stale periodic request must not run a cycle.
      Result.success()
    }
  } catch (_: Exception) {
    Result.retry()
  }
}
