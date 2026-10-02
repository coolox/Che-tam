# Task: APP-001 — каркас приложения и типы домена

- **ID:** `APP-001`
- **Status:** approved
- **Owner:** Hermes
- **Implementation agent:** Фатима
- **Depends on:** `docs/tasks/APP-PLAN-phase1-3.md`, commit `0b32e84` (плановые правки будут добавлены отдельным commit до старта реализации).

## Goal

Отделить UI Preview от будущего реального приложения на уровне структуры и типовых границ, не меняя видимое поведение, не включая сеть/авторизацию/SQLite и не трогая звонки. Ввести независимые domain-типы, которыми будут пользоваться следующие задачи.

## Context

- Фаза 1, APP-001 из `docs/tasks/APP-PLAN-phase1-3.md`.
- Текущий интерфейс — offline UI Preview с in-memory demo data в `App.tsx` и `src/ui/*`.
- Canary заморожен; любые Canary-файлы и ветка `codex/task-001d-canary-v4` вне scope.
- Звонки фазы 4 не входят в работу.
- В реальном приложении связь может отсутствовать: эта задача только закладывает типы состояний для будущих offline/sync/outbox задач, без любого сетевого обращения.

## Allowed scope

Создать или изменить только:

- `App.tsx` — минимальное подключение app shell без визуального/поведенческого регресса;
- `src/app/**` — composition/app shell границы;
- `src/domain/**` — чистые domain types и pure adapters, если нужны;
- `src/screens/**` — только тонкие adapters/wrappers для существующих preview экранов;
- `src/components/**` — только если нужен тонкий shared wrapper;
- `src/hooks/**` — только pure/local hooks без сети и persistence;
- `src/types/**` — если выбран вместо `src/domain/**`, но не дублировать типы;
- `__tests__/appShell.test.ts` и/или `__tests__/domainTypes.test.ts`;
- этот task-файл — только factual implementation note.

Не менять:

- `src/ui/demoData.ts`, `src/ui/state.ts`, `src/ui/theme.tsx`, `src/ui/tokens.ts`, `src/ui/types.ts` — кроме type-only import/re-export, если это действительно необходимо для совместимости;
- `android/**`, `ios/**`, `app.json`, `package.json`, lockfiles, assets;
- `src/nativeMonitor.ts`, `src/storage.ts`, `src/exportJournal.ts`, `src/schedulePolicy.ts`, `src/types.ts` (старые Canary-файлы);
- `canary-v4/**`, server/deploy/secret/configuration files;
- `docs/architecture/ADR-001-delivery.md` и `docs/tasks/APP-PLAN-phase1-3.md`.

## Requirements

- [ ] Создать явную app-layer границу, через которую `App.tsx` подключает существующий preview UI, без изменения экранов, текстов, тем, navigation semantics или mock call behavior.
- [ ] Ввести чистые типы домена для: `Profile`, `Chat`, `Message`, `MessageReceipt`, `Endpoint`, `ConnectionState`, `OutboxItem`.
- [ ] В типе сообщения предусмотреть стабильные `id` и `clientMessageId`; в outbox — состояние, число попыток и время следующей попытки. Это модели, не реализация SQLite или отправки.
- [ ] Ввести discriminated union состояния связи как минимум: `offline`, `connecting`, `online`, `degraded`, `retrying`; значения не должны говорить о реальном подключении, пока transport отсутствует.
- [ ] Domain слой не импортирует React Native, Expo, network, storage, auth, notification или Android API.
- [ ] Никаких HTTP/WebSocket/FCM, SQLite, secrets, credentials, server endpoints, auth, foreground service, notifications, background jobs, calls, media, build config или зависимостей.
- [ ] Добавить обязательные чистые автотесты: инварианты stable message/client IDs; допустимые состояния outbox; exhaustive/предсказуемые connection-state display mapping или selector. Существующие тесты сохранить.

## Acceptance criteria

- [ ] Визуальное поведение UI Preview осталось прежним: welcome, четыре tab, поиск, chat composer, settings, mock call screens и Back не регрессировали.
- [ ] Реальный app shell отделён от preview data; будущие задачи могут импортировать domain types, не импортируя `src/ui/demoData.ts`.
- [ ] Новые domain types не используют legacy `delivered: boolean` как модель статусов реальной доставки.
- [ ] Есть focused unit tests для новых pure domain/helper правил.
- [ ] `npm run lint`, `npm test`, `npm run typecheck` проходят.
- [ ] В Git не попадают secrets, runtime data, generated dependencies, APK, Canary или несвязанные изменения.

## Verification

Фатима запускает только эти безопасные проверки, не выполняя build/prebuild/Gradle:

```bash
npm run lint
npm test
npm run typecheck
```

Hermes независимо повторяет проверки, review и только после APP-003 собирает один общий APK для APP-001–APP-003. Отдельный APK и телефонная проверка для APP-001 не требуются.

## Constraints

- Сделать минимальное изменение, без рефакторинга `App.tsx` ради стиля.
- Не изменять существующие UI Preview фичи или данные; задача только о границах и типах.
- Если разделение невозможно без крупного UI refactor, остановиться и описать точный блокер вместо расширения scope.
- Фатима не выполняет `expo prebuild`, Gradle/native compile, emulator/physical device или APK build; это делает только Hermes.
- Фатима не коммитит и не пушит.

## Codex prompt

Прочитай `AGENTS.md`, этот task-файл, `docs/tasks/APP-PLAN-phase1-3.md`, `App.tsx`, `src/ui/types.ts`, `src/ui/state.ts` и существующие tests перед изменениями. Реализуй только APP-001 в разрешённой области. Верни список изменённых файлов, точные результаты `npm run lint`, `npm test`, `npm run typecheck`, и риски/ограничения. Не коммить, не собирай APK и не трогай Canary.
