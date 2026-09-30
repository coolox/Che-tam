package net.hearth.canary.monitor

import java.util.concurrent.atomic.AtomicBoolean

object CanaryRunGate {
    private val running = AtomicBoolean(false)
    @Volatile
    private var activeRunId: String? = null

    fun tryEnter(runId: String): Boolean {
        val entered = running.compareAndSet(false, true)
        if (entered) {
            activeRunId = runId
        }
        return entered
    }

    fun isRunning(): Boolean = running.get()

    fun currentRunId(): String? = activeRunId

    fun leave() {
        activeRunId = null
        running.set(false)
    }
}
