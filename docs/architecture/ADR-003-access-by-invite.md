# ADR-003 — access by invitation

**Status:** Proposed

## Context
Che-Tam is currently a small private family messenger at the local-foundation stage. There is no server-side account service in this phase. Phone/SMS sign-in adds a fragile external dependency and is not required for the initial closed group.

## Decision
Access is by one-time invitation code, issued manually by Arslan to an allowed list of approximately 15–20 people.

- The local app asks for `Код приглашения` and `Как вас зовут`; it does not collect a phone number and does not send or request SMS.
- Each invitation code is single-use at the future service boundary and binds the resulting account to one device (APP-010).
- A phone change receives a new code from Arslan; self-service transfer and phone/SMS fallback are out of scope.
- During `LOCAL_TEST_MODE`, only an explicit test invite code is accepted locally. It exists for local testing only and does not create a real account or network request.
- The authoritative issuance, validation, consumption, device binding and replacement-code audit belong to the server after ADR-002, tracked under APP-008. The app must treat a future server decision as authoritative.

## Consequences
- Local Foundation has a deterministic offline invitation gate and no external login traffic.
- The server implementation must support one-time code consumption, device binding, revocation/reissue, and conservative audit records without storing invitation codes in application logs.
- User names remain user-entered local profile display names until server identity is available.
