# APP-014L-17 — поиск чатов и сообщений из SQLite

- **Статус:** approved by Arslan, 2026-10-07. Previous APP-014L-16 accepted as `1b79cf6`.
- **Граница:** local SQLite/UI only. No APK/Gradle/prebuild, server/network/ADR-002/bot/secrets/build changes, commit or push.

## Цель

Верхняя лупа в списке чатов должна открывать реальный поиск по имени чата и тексту сообщений из локальной SQLite projection.

## Требования

1. Устранить dead search icon: на вкладке Chats верхняя лупа открывает существующий search UI; Back/cancel/clear ведут ожидаемо.
2. Result set: match по chat title и по body всех локально сохранённых сообщений; match case-insensitive Russian-aware; search results still show chat row, not a fake new data source.
3. Источник текстов — SQLite/repository projection. Не использовать demoData и не искать только в уже вручную загруженном UI subset: add minimal repository/store API suitable for a real local DB. Без FTS dependency/migration unless existing SQLite supports required simple query safely; parameterized values only.
4. Draft/last message ordering semantics remain intact; query filters existing chronological/pinned order.
5. Deterministic real SQLite tests cover title match, message-body-only match, no match, Russian case folding, and no SQL wildcard/injection confusion. UI/state tests cover opening from header and clearing/closing.

## Allowed

Minimal `src/app/PreviewAppShell.tsx`, `src/messages/**`, `src/storage/sqlite/**`, `src/ui/**`, tests, this task file. Do not touch protected coordinator docs or accepted task docs.

## Checks

Targeted + lint, full Jest, typecheck, diff check; final report exact rollout JSONL.