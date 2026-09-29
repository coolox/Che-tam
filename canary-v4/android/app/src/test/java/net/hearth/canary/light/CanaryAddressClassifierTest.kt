package net.hearth.canary.light

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.InetAddress

class CanaryAddressClassifierTest {
    @Test
    fun rejectsLoopbackPrivateAndZeroIpv4Addresses() {
        val invalid = listOf(
            "127.0.0.1",
            "10.12.0.1",
            "192.168.1.4",
            "172.16.0.1",
            "172.31.255.255",
            "0.0.0.0"
        )

        invalid.forEach { address ->
            assertTrue(address, CanaryAddressClassifier.isInvalidCanaryAddress(InetAddress.getByName(address)))
        }
    }

    @Test
    fun keeps172BoundaryAddressesPublicForThisRule() {
        assertFalse(CanaryAddressClassifier.isInvalidCanaryAddress(InetAddress.getByName("172.15.255.255")))
        assertFalse(CanaryAddressClassifier.isInvalidCanaryAddress(InetAddress.getByName("172.32.0.1")))
    }

    @Test
    fun detectsAddressFamilies() {
        assertEquals(CanaryAddressFamily.IPV4, CanaryAddressClassifier.family(InetAddress.getByName("173.212.231.182")))
        assertEquals(CanaryAddressFamily.IPV6, CanaryAddressClassifier.family(InetAddress.getByName("2001:4860:4860::8888")))
    }
}
