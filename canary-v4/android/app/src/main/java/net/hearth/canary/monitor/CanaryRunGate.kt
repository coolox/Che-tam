package net.hearth.canary.monitor

import java.util.concurrent.atomic.AtomicBoolean

object CanaryRunGate {
    private val running = AtomicBoolean(false)

    fun tryEnter(): Boolean = running.compareAndSet(false, true)

    fun isRunning(): Boolean = running.get()

    fun leave() {
        running.set(false)
    }
}
