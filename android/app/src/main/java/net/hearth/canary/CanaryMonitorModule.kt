package net.hearth.canary

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

class CanaryMonitorModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "CanaryMonitor"

  @ReactMethod fun start(promise: Promise) {
    val intent = Intent(context, CanaryMonitorService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    promise.resolve(true)
  }

  @ReactMethod fun stop(promise: Promise) {
    context.stopService(Intent(context, CanaryMonitorService::class.java))
    CanaryMonitorService.cancelFallback(context)
    promise.resolve(true)
  }

  /** Manual UI checks use the same native five-check runner; JavaScript never fabricates DNS results. */
  @ReactMethod fun runNow(promise: Promise) {
    Executors.newSingleThreadExecutor().execute {
      try {
        val records = CanaryMonitorService.runNativeCycle(context, "foreground") ?: emptyList()
        val output = Arguments.createArray()
        records.forEach { output.pushMap(toMap(it)) }
        promise.resolve(output)
      } catch (error: Exception) {
        promise.reject("CANARY_RUN_FAILED", "Native Canary run failed", error)
      }
    }
  }

  @ReactMethod fun isActive(promise: Promise) { promise.resolve(context.getSharedPreferences(CanaryMonitorService.PREFERENCES, Context.MODE_PRIVATE).getBoolean(CanaryMonitorService.ACTIVE_KEY, false)) }
  @ReactMethod fun isIgnoringBatteryOptimizations(promise: Promise) { val manager = context.getSystemService(PowerManager::class.java); promise.resolve(manager?.isIgnoringBatteryOptimizations(context.packageName) == true) }
  @ReactMethod fun requestIgnoreBatteryOptimizations(promise: Promise) {
    try { context.startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); promise.resolve(true) }
    catch (error: Exception) { promise.reject("BATTERY_OPTIMIZATION_REQUEST_FAILED", "Unable to open Android battery optimization request", error) }
  }

  @ReactMethod fun drainRecords(promise: Promise) {
    val preferences = context.getSharedPreferences(CanaryMonitorService.PREFERENCES, Context.MODE_PRIVATE)
    val stored: String
    synchronized(CanaryMonitorService.queueLock) {
      stored = preferences.getString(CanaryMonitorService.QUEUE_KEY, "[]") ?: "[]"
      preferences.edit().remove(CanaryMonitorService.QUEUE_KEY).commit()
    }
    val input = JSONArray(stored); val output = Arguments.createArray()
    for (index in 0 until input.length()) output.pushMap(toMap(input.getJSONObject(index)))
    promise.resolve(output)
  }

  private fun toMap(record: JSONObject): WritableMap = Arguments.createMap().apply {
    putString("timestampUtc", record.getString("timestampUtc")); putString("checkRunKey", record.getString("checkRunKey")); putString("testType", record.getString("testType")); putString("target", record.getString("target")); putBoolean("success", record.getBoolean("success")); putNullableInt("httpStatus", record, "httpStatus"); putDouble("latencyMs", record.getLong("latencyMs").toDouble())
    val phases = Arguments.createMap(); val phaseInput = record.getJSONObject("phases"); listOf("dnsMs", "tcpMs", "tlsMs", "httpMs").forEach { phases.putDoubleOrNull(it, phaseInput) }; putMap("phases", phases); putNullableString("resolvedIp", record, "resolvedIp"); putString("networkType", record.getString("networkType")); putNullableString("carrier", record, "carrier"); putString("appState", record.getString("appState")); putString("errorCategory", record.getString("errorCategory")); putNullableString("errorDetail", record, "errorDetail")
  }
  private fun WritableMap.putNullableInt(key: String, input: JSONObject, field: String) { if (input.isNull(field)) putNull(key) else putInt(key, input.getInt(field)) }
  private fun WritableMap.putNullableString(key: String, input: JSONObject, field: String) { if (input.isNull(field)) putNull(key) else putString(key, input.getString(field)) }
  private fun WritableMap.putDoubleOrNull(key: String, input: JSONObject) { if (input.isNull(key)) putNull(key) else putDouble(key, input.getDouble(key)) }
}
