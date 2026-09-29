package net.hearth.canary.light

import java.io.InterruptedIOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.security.cert.CertificateException
import javax.net.ssl.SSLHandshakeException
import javax.net.ssl.SSLPeerUnverifiedException
import javax.net.ssl.SSLProtocolException

object CanaryErrorClassifier {
    fun classify(throwable: Throwable, failedStage: CanaryPhaseStage?): CanaryErrorCategory {
        if (throwable is UnknownHostException) return CanaryErrorCategory.DNS_NXDOMAIN
        if (throwable is SocketTimeoutException || throwable is InterruptedIOException) {
            return when (failedStage) {
                CanaryPhaseStage.DNS -> CanaryErrorCategory.DNS_TIMEOUT
                CanaryPhaseStage.TCP -> CanaryErrorCategory.TCP_TIMEOUT
                CanaryPhaseStage.TLS -> CanaryErrorCategory.TLS_TIMEOUT
                CanaryPhaseStage.UPGRADE -> CanaryErrorCategory.WS_TIMEOUT
                else -> CanaryErrorCategory.OTHER
            }
        }
        if (throwable is NoRouteToHostException) return CanaryErrorCategory.NO_NETWORK
        if (throwable is ConnectException) {
            val message = throwable.message.orEmpty().lowercase()
            return if ("refused" in message) CanaryErrorCategory.TCP_REFUSED else CanaryErrorCategory.TCP_RESET
        }
        if (throwable is SSLPeerUnverifiedException) return CanaryErrorCategory.TLS_PIN_MISMATCH
        if (throwable is SSLHandshakeException || throwable is CertificateException) {
            return CanaryErrorCategory.TLS_HANDSHAKE_ERROR
        }
        if (throwable is SSLProtocolException) return CanaryErrorCategory.TLS_RESET
        if (throwable is SocketException) {
            val message = throwable.message.orEmpty().lowercase()
            return when {
                "reset" in message && failedStage == CanaryPhaseStage.TLS -> CanaryErrorCategory.TLS_RESET
                "reset" in message -> CanaryErrorCategory.TCP_RESET
                "closed" in message -> CanaryErrorCategory.WS_CLOSED
                else -> CanaryErrorCategory.OTHER
            }
        }
        return CanaryErrorCategory.OTHER
    }
}
