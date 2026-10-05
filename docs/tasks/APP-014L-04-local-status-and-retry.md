# APP-014L-04 — локальные статусы и повтор

## Контекст
APP-013L принят в `c7b043f`. Работать только с локальным SQLite и debug/development fake transport. Никаких production server, network calls, endpoint'ов, URL, SDK или ключей. `delivered`/`read` не моделировать и не выводить для локально созданных сообщений: они появляются только по будущему server/recipient confirmation.

## Цель
Реализовать локальную часть APP-014L для исходящих сообщений:

1. Явная проекция delivery state в UI: `queued`, `sent`, `not_sent`.
   - `queued`: часы и русский a11y label «В очереди».
   - `sent`: галочка и русский a11y label «Отправлено».
   - `not_sent`: красный восклицательный знак, русский a11y label «Не отправлено», доступная кнопка «Повторить» с русским a11y label.
   - Не использовать прежнее boolean `delivered` как источник истины для этих локальных статусов; при необходимости эволюционировать UI view-model минимально и не ломать fixture/входящие bubbles.

2. Локальная terminal failure:
   - расширить fake transport/test seam детерминированным результатом окончательной ошибки, который переводит `queued` в `not_sent` и не удаляет message;
   - terminal failure удаляет/завершает outbox item так, что worker не делает бесконечных автоматических retry;
   - timeout и временные failed/offline остаются существующей retry/backoff логикой, без busy loop.

3. Ручной retry:
   - нажатие «Повторить» доступно только для `not_sent` исходящего text message;
   - в **одной SQLite-транзакции** сменить message обратно на `queued` и заново создать/обновить один outbox item;
   - сохранить исходный `client_message_id`, `id`, body и created_at; никогда не создавать второй message или outbox item;
   - после restart `not_sent` и возможность retry сохраняются в SQLite; после retry и fake successful ack bubble становится `sent`.

4. Интеграция:
   - передать callback retry от `ConversationScreen` через `PreviewAppShell` в LocalMessageStore;
   - UI обновляется из SQLite snapshot, accessibility labels назначены непосредственно visual status/control;
   - NetInfo policy APP-013L не менять: only `useConnectionStatus.ts` imports NetInfo; worker reacts only to availability.

## Обязательные тесты
На **настоящем SQLite** добавить focused tests (не production network):
- terminal fake failure -> message/bubble `not_sent`, outbox больше не отправляется автоматически, label/модель отражают состояние;
- retry -> тот же `client_message_id`, ровно один message и один outbox item, затем fake successful ack -> `sent`, outbox пуст;
- restart сохраняет `not_sent`, затем retry с тем же ID не создаёт дублей.

Добавить/обновить UI/unit tests для русских accessibility labels и отсутствия derived delivered/read для APP-014L local statuses.

## Границы
- Не менять `docs/architecture/ADR-002-server-and-domains.md` и не добавлять его в commit.
- Не изменять correction notes `docs/tasks/APP-013L-03R-*` / `APP-013L-03RR-*`.
- Не делать unrelated refactor, не коммитить, не пушить, не собирать APK.

## Проверка
```bash
(npm run lint && npm test && npm run typecheck && git diff --check) 2>&1 | tail -15
```
