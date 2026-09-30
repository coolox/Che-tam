package net.hearth.canary.monitor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CanaryNetworkSnapshotExtractorTest {
    @Test
    fun wifiCapabilitiesIncludeTransportInfoWhenAvailable() {
        val snapshot = CanaryNetworkSnapshotExtractor.fromCapabilities(
            hasWifi = true,
            hasCellular = false,
            wifiRssi = -61,
            wifiLinkMbps = 144
        )

        assertEquals("wifi", snapshot.networkType)
        assertEquals(-61, snapshot.wifiRssi)
        assertEquals(144, snapshot.wifiLinkMbps)
    }

    @Test
    fun wifiCapabilitiesKeepNullableValuesWhenTransportInfoUnavailable() {
        val snapshot = CanaryNetworkSnapshotExtractor.fromCapabilities(
            hasWifi = true,
            hasCellular = false,
            wifiRssi = null,
            wifiLinkMbps = null
        )

        assertEquals("wifi", snapshot.networkType)
        assertNull(snapshot.wifiRssi)
        assertNull(snapshot.wifiLinkMbps)
    }

    @Test
    fun nonWifiCapabilitiesDoNotLeakWifiValues() {
        val snapshot = CanaryNetworkSnapshotExtractor.fromCapabilities(
            hasWifi = false,
            hasCellular = true,
            wifiRssi = -61,
            wifiLinkMbps = 144
        )

        assertEquals("cellular", snapshot.networkType)
        assertNull(snapshot.wifiRssi)
        assertNull(snapshot.wifiLinkMbps)
    }
}
