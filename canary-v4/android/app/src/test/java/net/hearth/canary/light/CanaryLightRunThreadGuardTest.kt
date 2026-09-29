package net.hearth.canary.light

import org.junit.Assert.assertThrows
import org.junit.Test

class CanaryLightRunThreadGuardTest {
    @Test
    fun rejectsMainThreadExecution() {
        val mainThread = Thread.currentThread()

        assertThrows(IllegalStateException::class.java) {
            CanaryLightRunThreadGuard.assertNotMainThread(
                currentThread = mainThread,
                mainThread = mainThread
            )
        }
    }

    @Test
    fun allowsBackgroundThreadExecution() {
        CanaryLightRunThreadGuard.assertNotMainThread(
            currentThread = Thread("canary-light-run"),
            mainThread = Thread.currentThread()
        )
    }
}
