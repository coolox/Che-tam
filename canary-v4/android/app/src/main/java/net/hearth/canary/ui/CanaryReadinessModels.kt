package net.hearth.canary.ui

data class CanaryReadinessInput(
    val notificationsAllowed: Boolean,
    val batteryOptimizationIgnored: Boolean,
    val exactAlarmAllowed: Boolean,
    val monitorRunInProgress: Boolean,
    val monitorScheduledRecently: Boolean
)

data class CanaryReadinessItem(
    val title: String,
    val ok: Boolean,
    val detail: String
)

data class CanaryReadinessSummary(
    val allProgrammaticChecksOk: Boolean,
    val statusText: String,
    val items: List<CanaryReadinessItem>
)

object CanaryReadinessFormatter {
    fun format(input: CanaryReadinessInput): CanaryReadinessSummary {
        val items = listOf(
            CanaryReadinessItem(
                title = "Уведомления",
                ok = input.notificationsAllowed,
                detail = if (input.notificationsAllowed) "разрешены" else "нужно разрешить"
            ),
            CanaryReadinessItem(
                title = "Батарея",
                ok = input.batteryOptimizationIgnored,
                detail = if (input.batteryOptimizationIgnored) "без ограничений Android" else "нужно отключить оптимизацию"
            ),
            CanaryReadinessItem(
                title = "Точные будильники",
                ok = input.exactAlarmAllowed,
                detail = if (input.exactAlarmAllowed) "разрешены" else "нужно разрешить"
            ),
            CanaryReadinessItem(
                title = "Монитор",
                ok = input.monitorRunInProgress || input.monitorScheduledRecently,
                detail = when {
                    input.monitorRunInProgress -> "прогон выполняется"
                    input.monitorScheduledRecently -> "сторож запланирован"
                    else -> "нет свежего расписания"
                }
            )
        )
        val allOk = items.all { it.ok }
        return CanaryReadinessSummary(
            allProgrammaticChecksOk = allOk,
            statusText = if (allOk) "всё в порядке" else "требует внимания",
            items = items
        )
    }
}
