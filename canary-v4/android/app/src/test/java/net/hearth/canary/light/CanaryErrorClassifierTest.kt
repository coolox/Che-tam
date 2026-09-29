package net.hearth.canary.light

import org.junit.Assert.assertEquals
import org.junit.Test
import java.net.ConnectException
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLHandshakeException
import javax.net.ssl.SSLPeerUnverifiedException

class CanaryErrorClassifierTest {
    @Test
    fun classifiesDnsAndStageTimeouts() {
        assertEquals(
            CanaryErrorCategory.DNS_NXDOMAIN,
            CanaryErrorClassifier.classify(UnknownHostException("missing"), CanaryPhaseStage.DNS)
        )
        assertEquals(
            CanaryErrorCategory.DNS_TIMEOUT,
            CanaryErrorClassifier.classify(SocketTimeoutException("timeout"), CanaryPhaseStage.DNS)
        )
        assertEquals(
            CanaryErrorCategory.TCP_TIMEOUT,
            CanaryErrorClassifier.classify(SocketTimeoutException("timeout"), CanaryPhaseStage.TCP)
        )
        assertEquals(
            CanaryErrorCategory.TLS_TIMEOUT,
            CanaryErrorClassifier.classify(SocketTimeoutException("timeout"), CanaryPhaseStage.TLS)
        )
    }

    @Test
    fun classifiesTcpTlsAndPinFailures() {
        assertEquals(
            CanaryErrorCategory.TCP_REFUSED,
            CanaryErrorClassifier.classify(ConnectException("Connection refused"), CanaryPhaseStage.TCP)
        )
        assertEquals(
            CanaryErrorCategory.TCP_RESET,
            CanaryErrorClassifier.classify(SocketException("Connection reset"), CanaryPhaseStage.TCP)
        )
        assertEquals(
            CanaryErrorCategory.TLS_RESET,
            CanaryErrorClassifier.classify(SocketException("Connection reset"), CanaryPhaseStage.TLS)
        )
        assertEquals(
            CanaryErrorCategory.TLS_HANDSHAKE_ERROR,
            CanaryErrorClassifier.classify(SSLHandshakeException("bad certificate"), CanaryPhaseStage.TLS)
        )
        assertEquals(
            CanaryErrorCategory.TLS_PIN_MISMATCH,
            CanaryErrorClassifier.classify(SSLPeerUnverifiedException("pin mismatch"), CanaryPhaseStage.TLS)
        )
    }
}
