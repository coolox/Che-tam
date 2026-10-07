# APP-014L-15 — превью SQLite-черновика в списке чатов

- **Статус:** approved for implementation by Arslan, 2026-10-07.
- **Зависимости:** APP-014L-07, APP-014L-14 (`97cb3cf`, accepted).
- **Граница:** локальная UI/SQLite задача. Не запускать Gradle/APK/prebuild; не менять сервер, сеть, ботов, секреты, ADR-002, build scripts или версии приложения.

## Цель

Если у чата есть сохранённый неотправленный composer draft, в его row списка чатов показывать `Черновик:` акцентным/красным цветом и затем draft text — по смыслу WhatsApp. После очистки черновика или успешной отправки обычный preview немедленно возвращается.

## Требования

1. Источник — существующая SQLite draft storage/repository. Не держать независимый in-memory источник, не использовать demo data.
2. Черновик не меняет `last_message_at`, порядок rows, unread или time label. В частности, старый чат с новым черновиком не поднимается выше чата с более свежим сообщением.
3. Обрезка текста/количество строк соответствует существующей геометрии списка и не ломает accessibility. Доступное label сообщает, что preview — черновик, но не дублирует текст бессмысленно.
4. Цветовой токен должен быть устойчивым в светлой и тёмной теме; использовать project theme/tokens, не захардкоженный случайный цвет.
5. Тесты на настоящей SQLite, где репозиторий хранит drafts, покрывают: сохранение, read/refresh после restart, display model с draft, очистку на empty/send, и неизменность сортировки по `lastMessageAt`. Добавить UI/state test для маркировки `Черновик:`.

## Разрешённые файлы

Минимально необходимые существующие `src/messages/**`, `src/storage/**`, `src/app/PreviewAppShell.tsx`, `src/ui/**`, соответствующие `__tests__/**`; этот task file. Если потребуется новый маленький pure selector — только в существующей области `src/ui/` или `src/messages/`.

## Запрещено

- Любые изменения `docs/architecture/ADR-002-server-and-domains.md`, `docs/tasks/APP-PLAN-phase1-3.md`, чужих незакоммиченных task files.
- Зависимости, инфраструктура, native/config changes, service controls.
- Commit, push, APK build.

## Проверки

Targeted tests, затем `npm run lint`, `npm test -- --runInBand`, `npm run typecheck`, `git diff --check`. Fatima final report: files, results, exact rollout JSONL filename.