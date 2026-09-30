package net.hearth.canary.monitor

data class CanaryManualFullQueueDecision(
    val pendingAfter: Boolean,
    val queued: Boolean,
    val writeSkipped: Boolean
)

object CanaryManualFullQueue {
    fun onGateBusy(wakeupMethod: String, pendingBefore: Boolean): CanaryManualFullQueueDecision =
        if (wakeupMethod == CanaryWakeupMethod.MANUAL_FULL) {
            CanaryManualFullQueueDecision(
                pendingAfter = true,
                queued = true,
                writeSkipped = true
            )
        } else {
            CanaryManualFullQueueDecision(
                pendingAfter = pendingBefore,
                queued = false,
                writeSkipped = true
            )
        }

    fun shouldDrain(pendingBefore: Boolean, gateRunning: Boolean): Boolean =
        pendingBefore && !gateRunning
}
