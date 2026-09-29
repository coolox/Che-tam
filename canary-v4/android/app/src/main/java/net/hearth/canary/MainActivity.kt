package net.hearth.canary

import android.Manifest
import android.app.Activity
import android.app.AlarmManager
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.FileProvider
import net.hearth.canary.monitor.CanaryEventDatabase
import net.hearth.canary.monitor.CanaryEventJournal
import net.hearth.canary.monitor.CanaryMonitorStarter
import net.hearth.canary.monitor.CanaryMonitorState
import net.hearth.canary.ui.CanaryDeviceLabelStore
import net.hearth.canary.ui.CanaryJournalExportFormatter
import net.hearth.canary.ui.CanaryJournalRecord
import net.hearth.canary.ui.CanaryJournalSummaryFormatter
import net.hearth.canary.ui.CanaryReadinessFormatter
import net.hearth.canary.ui.CanaryReadinessInput
import java.io.File

class MainActivity : Activity() {
    private lateinit var deviceLabelInput: EditText
    private lateinit var lastRunValue: TextView
    private lateinit var daySummaryValue: TextView
    private lateinit var appVersionValue: TextView
    private lateinit var readinessValue: TextView
    private lateinit var readinessItems: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(buildContent())
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun buildContent(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(20))
        }

        root.addView(TextView(this).apply {
            text = getString(R.string.main_title)
            textSize = 26f
            typeface = Typeface.DEFAULT_BOLD
        })

        root.addView(TextView(this).apply {
            text = getString(R.string.main_subtitle)
            textSize = 14f
            setPadding(0, dp(4), 0, dp(16))
        })

        deviceLabelInput = EditText(this).apply {
            hint = getString(R.string.device_label_hint)
            minHeight = dp(48)
            setSingleLine(true)
            setText(CanaryDeviceLabelStore.get(this@MainActivity))
            contentDescription = getString(R.string.device_label_content_description)
        }
        root.addView(label(getString(R.string.device_label_title)))
        root.addView(deviceLabelInput, matchWrap())
        root.addView(actionButton(getString(R.string.device_label_save_button)) {
            deviceLabelInput.setText(CanaryDeviceLabelStore.set(this, deviceLabelInput.text.toString()))
            refresh()
        })

        lastRunValue = valueRow(root, getString(R.string.last_run_title))
        daySummaryValue = valueRow(root, getString(R.string.day_summary_title))
        appVersionValue = valueRow(root, getString(R.string.app_version_title))
        readinessValue = valueRow(root, getString(R.string.readiness_title))

        root.addView(actionButton(getString(R.string.check_now_button)) {
            CanaryMonitorStarter.startFromManual(this)
            refresh()
        })
        root.addView(actionButton(getString(R.string.export_journal_button)) {
            shareJournalExport()
        })
        root.addView(actionButton(getString(R.string.readiness_button)) {
            readinessItems.visibility = if (readinessItems.visibility == View.VISIBLE) View.GONE else View.VISIBLE
            refresh()
        })

        readinessItems = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(12), 0, 0)
        }
        root.addView(readinessItems, matchWrap())

        return ScrollView(this).apply {
            addView(root)
        }
    }

    private fun refresh() {
        val now = System.currentTimeMillis()
        val records = allJournalRecords()
        val journalSummary = CanaryJournalSummaryFormatter.summarize(records, now)
        val readinessSummary = CanaryReadinessFormatter.format(readinessInput(now))

        lastRunValue.text = journalSummary.lastRunText
        daySummaryValue.text = journalSummary.runCountText
        appVersionValue.text = BuildConfig.VERSION_NAME
        readinessValue.text = readinessSummary.statusText
        readinessValue.setTextColor(if (readinessSummary.allProgrammaticChecksOk) COLOR_OK else COLOR_ALERT)

        readinessItems.removeAllViews()
        readinessSummary.items.forEach { item ->
            readinessItems.addView(TextView(this).apply {
                text = "${item.title}: ${item.detail}"
                textSize = 16f
                setTextColor(if (item.ok) COLOR_OK else COLOR_ALERT)
                setPadding(0, dp(6), 0, dp(2))
            })
        }
        readinessItems.addView(actionButton(getString(R.string.notification_settings_button)) {
            openAppSettings()
        })
        readinessItems.addView(actionButton(getString(R.string.battery_settings_button)) {
            openBatterySettings()
        })
        readinessItems.addView(actionButton(getString(R.string.exact_alarm_settings_button)) {
            openExactAlarmSettings()
        })
        readinessItems.addView(TextView(this).apply {
            text = getString(R.string.miui_autostart_manual_note)
            textSize = 14f
            setPadding(0, dp(12), 0, dp(4))
        })
        readinessItems.addView(actionButton(getString(R.string.miui_autostart_button)) {
            openMiuiAutostart()
        })
    }

    private fun shareJournalExport() {
        val deviceLabel = CanaryDeviceLabelStore.set(this, deviceLabelInput.text.toString())
        val exportedAt = System.currentTimeMillis()
        val exportJson = CanaryJournalExportFormatter.buildExportJson(
            exportedAtUtc = exportedAt,
            appVersion = BuildConfig.VERSION_NAME,
            deviceLabel = deviceLabel,
            records = allJournalRecords()
        )
        val exportDir = File(cacheDir, "journal-export").apply { mkdirs() }
        val exportFile = File(exportDir, "hearth-canary-journal-v4-$exportedAt.json")
        exportFile.writeText(exportJson, Charsets.UTF_8)
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", exportFile)
        val sendIntent = Intent(Intent.ACTION_SEND)
            .setType("application/json")
            .putExtra(Intent.EXTRA_STREAM, uri)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        startActivity(Intent.createChooser(sendIntent, getString(R.string.export_journal_chooser_title)))
    }

    private fun allJournalRecords(): List<CanaryJournalRecord> {
        val dao = CanaryEventDatabase.get(this).eventDao()
        return CanaryEventJournal(dao).oldestFirst(Int.MAX_VALUE)
            .map { CanaryJournalRecord(it.timestampUtc, it.payloadJson) }
    }

    private fun readinessInput(now: Long): CanaryReadinessInput {
        val alarmManager = getSystemService(AlarmManager::class.java)
        val powerManager = getSystemService(PowerManager::class.java)
        val notificationManager = getSystemService(NotificationManager::class.java)
        val monitorState = CanaryMonitorState.snapshot(this, now)
        return CanaryReadinessInput(
            notificationsAllowed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            } else {
                notificationManager.areNotificationsEnabled()
            },
            batteryOptimizationIgnored = powerManager.isIgnoringBatteryOptimizations(packageName),
            exactAlarmAllowed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                alarmManager.canScheduleExactAlarms()
            } else {
                true
            },
            monitorRunInProgress = monitorState.runInProgress,
            monitorScheduledRecently = monitorState.scheduledRecently
        )
    }

    private fun valueRow(root: LinearLayout, title: String): TextView {
        root.addView(label(title))
        return TextView(this).apply {
            textSize = 18f
            setPadding(0, 0, 0, dp(12))
            root.addView(this, matchWrap())
        }
    }

    private fun label(text: String): TextView =
        TextView(this).apply {
            this.text = text
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(0, dp(10), 0, dp(4))
        }

    private fun actionButton(text: String, onClick: () -> Unit): Button =
        Button(this).apply {
            this.text = text
            minHeight = dp(48)
            minimumHeight = dp(48)
            gravity = Gravity.CENTER
            setOnClickListener { onClick() }
        }

    private fun openAppSettings() {
        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
    }

    private fun openBatterySettings() {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            .setData(Uri.parse("package:$packageName"))
        runCatching { startActivity(intent) }.onFailure { openAppSettings() }
    }

    private fun openExactAlarmSettings() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            runCatching {
                startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName")))
            }.onFailure { openAppSettings() }
        } else {
            openAppSettings()
        }
    }

    private fun openMiuiAutostart() {
        val intent = Intent().apply {
            setClassName(
                "com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity"
            )
        }
        try {
            startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            openAppSettings()
        } catch (_: SecurityException) {
            openAppSettings()
        }
    }

    private fun matchWrap(): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    companion object {
        private const val COLOR_OK = 0xFF1B7F3A.toInt()
        private const val COLOR_ALERT = 0xFFB3261E.toInt()
    }
}
