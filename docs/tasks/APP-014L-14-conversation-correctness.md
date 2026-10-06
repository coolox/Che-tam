# APP-014L-14 — корректность conversation: scroll, local time, delivery marks

- **Статус:** approved for implementation by Arslan, 2026-10-06.
- **Зависимости:** APP-013L, APP-014L-04, APP-014L-05, APP-014L-08, APP-014L-12.
- **Граница:** полностью локальная задача до ADR-002. Без сети, production endpoint, серверных receipt, миграций без необходимости, APK/Gradle/prebuild, сервисов, секретов и изменения `docs/architecture/ADR-002-server-and-domains.md`.

## Цель

Устранить три проверенные на телефоне проблемы: последнее собственное сообщение скрывается composer при открытой клавиатуре; одно и то же сообщение получает разные часы в bubble/list; у статуса `sent` два раздельных check icon.

## Разрешённые области

- `src/app/**`, `src/messages/**`, `src/storage/**`, `src/ui/**`, `src/domain/**` — только минимально необходимые существующие файлы;
- соответствующие `__tests__/**`;
- при необходимости `package.json`/`package-lock.json` только для уже требуемой UI icon dependency, без обновлений прочих зависимостей;
- этот task-file — только если нужно зафиксировать implementation notes.

Не трогать ADR-002, другие task notes, build scripts, Android-конфигурацию, `.env*`, secrets, инфраструктуру и ботов.

## Требования

### 1. Scroll после собственной отправки

- При собственной отправке, когда клавиатура открыта, conversation должен докрутиться так, чтобы новый bubble был виден целиком над composer.
- Использовать корректный lifecycle/layout callback, а не timeout, который ломает чтение истории.
- Входящие сообщения не должны уводить пользователя, если он читает историю выше нижней границы.
- Добавить детерминированный unit/component test для запроса scroll после собственной отправки и keyboard-open layout path.

### 2. Единое local civil time

- Проследить путь `sent_at`: запись в SQLite, чтение repository, formatting bubble, preview/last-message в chat list и date separators.
- Одно хранимое instant value форматировать везде по timezone телефона; не повторно интерпретировать UTC ISO как local wall time и не использовать разные timezone/date helpers в bubble/list.
- В `Europe/Istanbul` timestamp, который пользователь видит в 11:08, должен быть 11:08 и в bubble, и в preview; separator корректно остаётся «Сегодня» при той же local calendar date.
- Добавить тесты с фиксированной timezone для `Europe/Istanbul` и `Asia/Ashgabat`, включая storage/repository где есть SQLite, и проверяющие bubble/list/separator единым expected local time.

### 3. Один delivery indicator

- Удалить одновременное отображение отдельных `LocalDeliveryIcon` и `ReceiptIcon` для одного сообщения.
- `queued`: часы; `sent`: ровно один Check; будущий `delivered`: слитный CheckCheck; будущий `read`: слитный CheckCheck accent color; `not_sent` оставить как сейчас.
- Не выдавать delivered/read по догадке: они остаются server-only future states. Если текущая локальная модель их не содержит, подготовить pure mapping/test без фальшивого runtime transition.
- Использовать существующую икон-систему проекта; не добавлять дубликаты/текстовые Unicode-замены. Добавить coverage каждого отображаемого состояния и количества иконок.

## Проверки

Fatima выполняет только targeted + `npm run lint`, `npm test`, `npm run typecheck`, `git diff --check`; не запускает Gradle/APK. Тесты на данных сообщений/черновиков используют настоящую SQLite-базу, где существует репозиторная граница.

## Приёмка Hermes

- Независимо просмотреть diff и убедиться, что не тронуты protected files.
- Независимо запустить full lint/test/typecheck/diff check.
- После успешной проверки закоммитить с `Written-by: codex rollout-...jsonl`, push в `feat/app-phase-1-3`.
- Краткий отчёт пользователю после задачи: ровно 3 строки (изменение; проверки; commit/push). APK пока не собирать.
