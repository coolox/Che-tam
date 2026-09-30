package net.hearth.canary.light

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CanaryTrafficDeltaCalculatorTest {
    @Test
    fun returnsNonNegativeDeltas() {
        val delta = CanaryTrafficDeltaCalculator.delta(
            before = CanaryTrafficSample(bytesTx = 100L, bytesRx = 200L),
            after = CanaryTrafficSample(bytesTx = 125L, bytesRx = 260L)
        )

        assertEquals(25L, delta?.bytesTx)
        assertEquals(60L, delta?.bytesRx)
    }

    @Test
    fun omitsUnavailableOrNegativeDeltas() {
        val delta = CanaryTrafficDeltaCalculator.delta(
            before = CanaryTrafficSample(bytesTx = null, bytesRx = 200L),
            after = CanaryTrafficSample(bytesTx = 125L, bytesRx = 150L)
        )

        assertNull(delta)
    }

    @Test
    fun keepsZeroAsValidAggregateDelta() {
        val delta = CanaryTrafficDeltaCalculator.delta(
            before = CanaryTrafficSample(bytesTx = 100L, bytesRx = 200L),
            after = CanaryTrafficSample(bytesTx = 100L, bytesRx = 205L)
        )

        assertEquals(0L, delta?.bytesTx)
        assertEquals(5L, delta?.bytesRx)
    }
}
