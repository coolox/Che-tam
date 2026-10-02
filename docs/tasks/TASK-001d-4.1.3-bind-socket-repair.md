# TASK-001d-4.1.3-bind-socket-repair — compile and prove UDP bind cleanup

## Status
Approved continuation of the already-authorized TASK-001d v4.1.3 work. Hermes independently ran the focused test and found this compile blocker:

```
CanaryServiceReachTest.kt:645:46 Overload resolution ambiguity between candidates:
constructor(p0: DatagramSocketImpl!): DatagramSocket
constructor(p0: SocketAddress!): DatagramSocket
```

## Scope
Only Fatima changes code. Make the smallest correction necessary for the deterministic test of the pre-`use` failure path in `JvmCanaryDnsDatagramSocketFactory.open` to compile and prove that a raw `DatagramSocket` is closed when `Network.bindSocket(socket)` (the injected `bindSocket`) throws.

## Allowed files
- `canary-v4/android/app/src/test/java/net/hearth/canary/full/CanaryServiceReachTest.kt`
- `canary-v4/android/app/src/main/java/net/hearth/canary/full/CanaryServiceReach.kt` **only if the production cleanup path itself needs correction**.

## Requirements
1. Preserve the current production guarantee: raw socket creation happens before `bindSocket`; if `bindSocket` throws, close that raw socket and rethrow the same throwable; if bind succeeds, ownership passes to the returned wrapper and later `.use` closes it.
2. Fix the test's ambiguous `DatagramSocket(null)` constructor without weakening/removing the test.
3. Keep it deterministic; no public network, no sleeps.
4. Do not touch other files, do not build/prebuild/Gradle, do not commit, push, restart services, access secrets, or run external writes.
5. Run only the focused unit test command if permitted by repository rules; otherwise state that Hermes must run it.

## Hermes verification after your edit
`./gradlew testReleaseUnitTest --tests net.hearth.canary.full.CanaryServiceReachTest.jvmDatagramSocketFactoryClosesRawSocketWhenBindThrows`

## Report
List changed files and whether the focused test was run. Do not claim the release suite or APK is complete.
