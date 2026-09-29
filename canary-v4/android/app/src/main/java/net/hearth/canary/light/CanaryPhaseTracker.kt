package net.hearth.canary.light

class CanaryPhaseTracker(private val clockMs: () -> Long = { System.currentTimeMillis() }) {
    private var dnsStartedAt: Long? = null
    private var tcpStartedAt: Long? = null
    private var tlsStartedAt: Long? = null
    private var httpStartedAt: Long? = null
    private var upgradeStartedAt: Long? = null
    private var phases = CanaryPhases()
    private var activeStage: CanaryPhaseStage? = null
    private var tcpComplete = false

    fun dnsStart() {
        dnsStartedAt = clockMs()
        activeStage = CanaryPhaseStage.DNS
    }

    fun dnsEnd() {
        phases = phases.copy(dnsMs = elapsedFrom(dnsStartedAt))
        activeStage = null
    }

    fun tcpStart() {
        tcpStartedAt = clockMs()
        activeStage = CanaryPhaseStage.TCP
    }

    fun tcpEnd() {
        if (tcpComplete) return
        phases = phases.copy(tcpMs = elapsedFrom(tcpStartedAt))
        tcpComplete = true
        activeStage = null
    }

    fun tlsStart() {
        tlsStartedAt = clockMs()
        activeStage = CanaryPhaseStage.TLS
    }

    fun tlsEnd() {
        phases = phases.copy(tlsMs = elapsedFrom(tlsStartedAt))
        activeStage = null
    }

    fun httpStart() {
        httpStartedAt = clockMs()
        activeStage = CanaryPhaseStage.HTTP
    }

    fun httpEnd() {
        phases = phases.copy(httpMs = elapsedFrom(httpStartedAt))
        activeStage = null
    }

    fun upgradeStart() {
        upgradeStartedAt = clockMs()
        activeStage = CanaryPhaseStage.UPGRADE
    }

    fun upgradeEnd() {
        phases = phases.copy(upgradeMs = elapsedFrom(upgradeStartedAt))
        activeStage = null
    }

    fun fail(): CanaryPhaseStage? {
        val failedStage = activeStage ?: firstStartedUnfinishedStage()
        if (failedStage != null) {
            phases = phases.withFailedStage(failedStage)
        }
        activeStage = null
        return failedStage
    }

    fun snapshot(): CanaryPhases = phases

    private fun elapsedFrom(startedAt: Long?): Long? =
        startedAt?.let { (clockMs() - it).coerceAtLeast(0L) }

    private fun firstStartedUnfinishedStage(): CanaryPhaseStage? =
        when {
            httpStartedAt != null && phases.httpMs == null -> CanaryPhaseStage.HTTP
            tlsStartedAt != null && phases.tlsMs == null -> CanaryPhaseStage.TLS
            tcpStartedAt != null && phases.tcpMs == null -> CanaryPhaseStage.TCP
            dnsStartedAt != null && phases.dnsMs == null -> CanaryPhaseStage.DNS
            upgradeStartedAt != null && phases.upgradeMs == null -> CanaryPhaseStage.UPGRADE
            else -> null
        }
}
