# Canary v2 target configuration (approved)

Configured targets for `TASK-001b`:

- `control_dns`: `https://turkmenportal.com/` — local availability control.
- `control_http`: `https://www.apple.com/` — international HTTP availability control.
- monitored endpoint: existing `EXPO_PUBLIC_CANARY_ENDPOINT`, managed separately at build time.

Reserved, not included in the fixed five-test cycle: Microsoft, Yandex and Gismeteo. They may only be used by a later approved task that expands the journal/test matrix.
