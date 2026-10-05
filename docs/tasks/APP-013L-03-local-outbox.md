# APP-013L-03 — локальная очередь и оптимистичная отправка

## Контекст
APP-013L разрешён до ADR-002. Локальный SQLite — единственный источник истины. Production server, реальные network calls, endpoint'ы, URL, ключи и новые SDK запрещены. Только debug/development fake transport допустим для детерминированных тестов и preview.

## Задача
Реализовать локальную часть APP-013:

1. Composer создаёт UUID `client_message_id` и в одной SQLite-транзакции сохраняет message и outbox item. Новое сообщение со статусом `queued` мгновенно видно в открытом чате.
2. Outbox worker берёт элементы строго по порядку, гарантирует один in-flight send на item, применяет 30-секундный timeout и backoff без busy loop.
3. Fake transport доступен только в debug/development и даёт детерминированный local ack; он не выполняет сеть. При offline попытка не стартует. Когда статус возвращается online, queued items обрабатываются автоматически по порядку.
4. Kill/restart сохраняет queued item в SQLite и после bootstrap он остаётся в очереди. Список чатов обновляет latest preview и время от локального сообщения.
5. UI не создаёт вторую bubble/outbox запись при обработке уже существующего item.

## Тесты и приёмка
На настоящем SQLite добавить сфокусированные тесты: отправка; offline → online; порядок двух сообщений; restart с queued item; один message/outbox item и один client_message_id без дублей. Тесты не используют production network.

## Границы
- Не реализовывать `not_sent`, ручной «Повторить», bubble-иконки и accessibility labels: это APP-014L.
- Не реализовывать delivered/read либо server ack.
- Не менять несвязанные экраны и не собирать APK; не коммитить и не пушить.

## Проверка
```bash
(npm run lint && npm test && npm run typecheck && git diff --check) 2>&1 | tail -15
```
