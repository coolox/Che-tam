package net.hearth.canary

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.telephony.TelephonyManager
import org.json.JSONArray
import org.json.JSONObject
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.SocketTimeoutException
import java.net.URI
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLException
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory

/**
 * Executes one bounded five-check monitor cycle. DNS results are evidence only;
 * every HTTP/TLS/WebSocket connection uses the original hostname URL/socket.
 */
internal class CanaryProbeRunner(private val context: Context, private val appState: String) {
  fun runAndPersist(): List<JSONObject> {
    val runKey = Instant.now().toString()
    val network = networkType()
    val carrier = carrier()
    val pool = Executors.newFixedThreadPool(REQUIRED_TESTS.size)
    return try {
      val futures = REQUIRED_TESTS.map { testType ->
        pool.submit(Callable { runOneSafely(testType, runKey, network, carrier) })
      }
      val records = futures.mapIndexed { index, future ->
        try {
          future.get(PHASE_TIMEOUT_MS.toLong() + TIMEOUT_MS, TimeUnit.MILLISECONDS)
        } catch (_: Exception) {
          fallbackRecord(runKey, REQUIRED_TESTS[index], network, carrier, "native check did not complete")
        }
      }
      appendResults(context, records)
      records
    } finally {
      pool.shutdownNow()
    }
  }

  private fun runOneSafely(type: String, runKey: String, network: String, carrier: String?): JSONObject = try {
    when (type) {
      "control_dns" -> runDns(runKey, type, BuildConfig.CANARY_CONTROL_DNS, network, carrier)
      "control_http" -> runHttp(runKey, type, BuildConfig.CANARY_CONTROL_HTTP, network, carrier)
      "dns_resolve" -> runDns(runKey, type, BuildConfig.CANARY_ENDPOINT, network, carrier)
      "http_domain" -> runHttp(runKey, type, BuildConfig.CANARY_ENDPOINT, network, carrier)
      "ws_domain" -> runWebSocket(runKey, network, carrier)
      else -> fallbackRecord(runKey, type, network, carrier, "unknown check type")
    }
  } catch (_: Exception) {
    fallbackRecord(runKey, type, network, carrier, "native check failed unexpectedly")
  }

  private fun runDns(runKey: String, type: String, endpoint: String, network: String, carrier: String?): JSONObject {
    val started = System.currentTimeMillis()
    val uri = configuredUrl(endpoint)
      ?: return record(runKey, type, "not_configured", false, started, network, carrier, null, null, "unknown", "target is not configured")
    return try {
      val resolved = InetAddress.getAllByName(uri.host).firstOrNull()?.hostAddress
      record(runKey, type, uri.host, resolved != null, started, network, carrier, null, resolved,
        if (resolved == null) "dns_nxdomain" else "unknown", if (resolved == null) "system resolver returned no address" else null,
        phases(dnsMs = System.currentTimeMillis() - started))
    } catch (_: SocketTimeoutException) {
      record(runKey, type, uri.host, false, started, network, carrier, null, null, "dns_timeout", "system resolver timed out", phases(dnsMs = System.currentTimeMillis() - started))
    } catch (_: Exception) {
      record(runKey, type, uri.host, false, started, network, carrier, null, null, "dns_nxdomain", "system resolver did not resolve the domain", phases(dnsMs = System.currentTimeMillis() - started))
    }
  }

  private fun runHttp(runKey: String, type: String, endpoint: String, network: String, carrier: String?): JSONObject {
    val started = System.currentTimeMillis()
    val uri = configuredUrl(endpoint)
      ?: return record(runKey, type, "not_configured", false, started, network, carrier, null, null, "unknown", "HTTPS target is not configured")
    var resolvedIp: String? = null
    var dnsMs: Long? = null
    return try {
      val dnsStarted = System.currentTimeMillis()
      resolvedIp = InetAddress.getAllByName(uri.host).firstOrNull()?.hostAddress
      dnsMs = System.currentTimeMillis() - dnsStarted
      // URLConnection owns DNS/TCP/TLS as one hostname-based connection. Do not invent TCP/TLS timings.
      val connection = (uri.toURL().openConnection() as HttpURLConnection).apply {
        requestMethod = "GET"
        connectTimeout = TIMEOUT_MS
        readTimeout = TIMEOUT_MS
        useCaches = false
      }
      val httpStarted = System.currentTimeMillis()
      val status = connection.responseCode
      val httpMs = System.currentTimeMillis() - httpStarted
      connection.disconnect()
      record(runKey, type, uri.host, status in 200..299, started, network, carrier, status, resolvedIp,
        if (status in 200..299) "unknown" else "http_error", if (status in 200..299) null else "HTTP response was not successful",
        phases(dnsMs = dnsMs, httpMs = httpMs))
    } catch (_: java.net.UnknownHostException) {
      record(runKey, type, uri.host, false, started, network, carrier, null, resolvedIp, "dns_nxdomain", "domain did not resolve", phases(dnsMs = dnsMs))
    } catch (_: SocketTimeoutException) {
      record(runKey, type, uri.host, false, started, network, carrier, null, resolvedIp, "tcp_timeout", "hostname-based HTTPS request timed out", phases(dnsMs = dnsMs))
    } catch (_: SSLException) {
      record(runKey, type, uri.host, false, started, network, carrier, null, resolvedIp, "tls_error", "hostname-based TLS connection failed", phases(dnsMs = dnsMs))
    } catch (_: ConnectException) {
      record(runKey, type, uri.host, false, started, network, carrier, null, resolvedIp, "tcp_refused", "connection refused", phases(dnsMs = dnsMs))
    } catch (_: Exception) {
      record(runKey, type, uri.host, false, started, network, carrier, null, resolvedIp, "tcp_unreachable", "HTTPS domain request failed", phases(dnsMs = dnsMs))
    }
  }

  private fun runWebSocket(runKey: String, network: String, carrier: String?): JSONObject {
    val started = System.currentTimeMillis()
    val endpoint = configuredUrl(BuildConfig.CANARY_ENDPOINT)
      ?: return record(runKey, "ws_domain", "not_configured", false, started, network, carrier, null, null, "unknown", "WebSocket target is not configured")
    return try {
      val port = if (endpoint.port == -1) 443 else endpoint.port
      // This constructor connects by hostname and preserves normal TLS hostname verification/SNI.
      val socket = SSLSocketFactory.getDefault().createSocket(endpoint.host, port) as SSLSocket
      socket.soTimeout = TIMEOUT_MS
      val tlsStarted = System.currentTimeMillis()
      socket.startHandshake()
      val tlsMs = System.currentTimeMillis() - tlsStarted
      val path = endpoint.rawPath?.takeIf { it.isNotBlank() } ?: "/"
      val key = android.util.Base64.encodeToString(UUID.randomUUID().toString().toByteArray(), android.util.Base64.NO_WRAP)
      val httpStarted = System.currentTimeMillis()
      socket.outputStream.write("GET $path HTTP/1.1\r\nHost: ${endpoint.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: $key\r\n\r\n".toByteArray(Charsets.US_ASCII))
      socket.outputStream.flush()
      val response = socket.inputStream.bufferedReader(Charsets.US_ASCII).readLine() ?: ""
      val httpMs = System.currentTimeMillis() - httpStarted
      socket.close()
      val success = response.contains(" 101 ")
      record(runKey, "ws_domain", endpoint.host, success, started, network, carrier, null, null,
        if (success) "unknown" else "websocket_error", if (success) null else "server did not accept WebSocket upgrade",
        phases(tlsMs = tlsMs, httpMs = httpMs))
    } catch (_: SocketTimeoutException) {
      record(runKey, "ws_domain", endpoint.host, false, started, network, carrier, null, null, "tls_timeout", "WebSocket TLS or upgrade timed out")
    } catch (_: SSLException) {
      record(runKey, "ws_domain", endpoint.host, false, started, network, carrier, null, null, "tls_error", "WebSocket TLS connection failed")
    } catch (_: Exception) {
      record(runKey, "ws_domain", endpoint.host, false, started, network, carrier, null, null, "websocket_error", "WebSocket domain request failed")
    }
  }

  private fun fallbackRecord(runKey: String, type: String, network: String, carrier: String?, detail: String) =
    record(runKey, type, "not_available", false, System.currentTimeMillis(), network, carrier, null, null, "unknown", detail)

  private fun networkType(): String {
    val manager = context.getSystemService(ConnectivityManager::class.java)
    val network = manager?.activeNetwork ?: return "none"
    val capabilities = manager.getNetworkCapabilities(network) ?: return "none"
    return when {
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
      else -> "unknown"
    }
  }

  private fun carrier(): String? = try {
    context.getSystemService(TelephonyManager::class.java)?.networkOperatorName?.takeIf { it.isNotBlank() }
  } catch (_: Exception) { null }

  private fun configuredUrl(value: String): URI? = try {
    URI(value).takeIf { it.scheme == "https" && it.host != null && !it.host.contains("example.invalid") }
  } catch (_: Exception) { null }

  private fun phases(dnsMs: Long? = null, tcpMs: Long? = null, tlsMs: Long? = null, httpMs: Long? = null) = JSONObject().apply {
    put("dnsMs", dnsMs ?: JSONObject.NULL); put("tcpMs", tcpMs ?: JSONObject.NULL); put("tlsMs", tlsMs ?: JSONObject.NULL); put("httpMs", httpMs ?: JSONObject.NULL)
  }

  private fun record(runKey: String, type: String, target: String, success: Boolean, started: Long, network: String, carrier: String?, status: Int?, resolvedIp: String?, error: String, detail: String?, timing: JSONObject = phases()) = JSONObject().apply {
    put("timestampUtc", Instant.now().toString()); put("checkRunKey", runKey); put("testType", type); put("target", target); put("success", success); put("httpStatus", status ?: JSONObject.NULL); put("latencyMs", System.currentTimeMillis() - started)
    put("phases", timing); put("resolvedIp", resolvedIp ?: JSONObject.NULL); put("networkType", network); put("carrier", carrier ?: JSONObject.NULL); put("appState", appState); put("errorCategory", error); put("errorDetail", detail ?: JSONObject.NULL)
  }

  companion object {
    const val TIMEOUT_MS = 15_000
    private const val PHASE_TIMEOUT_MS = TIMEOUT_MS + 2_000
    private val REQUIRED_TESTS = listOf("control_dns", "control_http", "dns_resolve", "http_domain", "ws_domain")

    fun appendResults(context: Context, results: List<JSONObject>) {
      val preferences = context.getSharedPreferences(CanaryMonitorService.PREFERENCES, Context.MODE_PRIVATE)
      synchronized(CanaryMonitorService.queueLock) {
        val existing = JSONArray(preferences.getString(CanaryMonitorService.QUEUE_KEY, "[]"))
        results.forEach(existing::put)
        preferences.edit().putString(CanaryMonitorService.QUEUE_KEY, existing.toString()).commit()
      }
    }
  }
}
