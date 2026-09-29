package net.hearth.canary.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CanaryReadinessModelsTest {
    @Test
    fun allProgrammaticChecksOkWhenRequiredSystemStatesAreReady() {
        val summary = CanaryReadinessFormatter.format(
            CanaryReadinessInput(
                notificationsAllowed = true,
                batteryOptimizationIgnored = true,
                exactAlarmAllowed = true,
                exactAlarmRemediationVisible = false,
                monitorRunInProgress = false,
                monitorScheduledRecently = true
            )
        )

        assertTrue(summary.allProgrammaticChecksOk)
        assertEquals("всё в порядке", summary.statusText)
        assertFalse(summary.showExactAlarmSettingsButton)
        assertEquals("сторож запланирован", summary.items.last().detail)
    }

    @Test
    fun monitorRunningCountsAsReadyWithoutClaimingMiuiAutostart() {
        val summary = CanaryReadinessFormatter.format(
            CanaryReadinessInput(
                notificationsAllowed = true,
                batteryOptimizationIgnored = false,
                exactAlarmAllowed = true,
                exactAlarmRemediationVisible = false,
                monitorRunInProgress = true,
                monitorScheduledRecently = false
            )
        )

        assertFalse(summary.allProgrammaticChecksOk)
        assertEquals("требует внимания", summary.statusText)
        assertEquals("прогон выполняется", summary.items.last().detail)
        assertTrue(summary.items.none { it.title.contains("MIUI", ignoreCase = true) })
    }

    @Test
    fun exactAlarmDenialIsRedAndShowsRemediationWhenAllowedByPlatformState() {
        val summary = CanaryReadinessFormatter.format(
            CanaryReadinessInput(
                notificationsAllowed = true,
                batteryOptimizationIgnored = true,
                exactAlarmAllowed = false,
                exactAlarmRemediationVisible = true,
                monitorRunInProgress = false,
                monitorScheduledRecently = true
            )
        )

        val exactAlarmItem = summary.items.single { it.title == "Точные будильники" }
        assertFalse(summary.allProgrammaticChecksOk)
        assertFalse(exactAlarmItem.ok)
        assertEquals("нужно разрешить", exactAlarmItem.detail)
        assertTrue(summary.showExactAlarmSettingsButton)
    }
}
