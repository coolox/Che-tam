# APP-PLAN — фазы 1–3: фундамент, доступ и базовая переписка

- **Статус:** на утверждении; реализации нет.
- **Ветка:** `feat/app-phase-1-3` (от `main`).
- **Граница:** Android-first. Canary `codex/task-001d-canary-v4` заморожен и в этот план не входит. Звонки и их экраны — только исторический UI Preview; реализация звонков (фаза 4) из плана исключена.
- **Правило поставки:** APP-001, APP-002 и APP-003 — три отдельные задачи с отдельными обязательными автоматическими тестами; phone verification входит в APP-003. Для этой тройки выдаётся один общий проверяемый APK только после завершения всех трёх задач. Каждый последующий task получает отдельный проверяемый APK. Фатима изменяет код только по утверждённому task-файлу; Hermes выполняет проверки, сборку, подпись, SHA-256, commit/push и передачу APK.

## Архитектурная граница

ADR-001 определяет Android-доставку: в нормальном режиме приложение пробуждается срочным FCM и не держит постоянный socket/уведомление. Если сервер зафиксировал недоставку FCM, включается запасной foreground WebSocket с тихим постоянным уведомлением; он не заменяет FCM, а дублирует сигнал с дедупликацией по стабильному ID. При каждом push/подключении клиент синхронизирует пропущенные записи. Все исходящие сообщения сначала записываются в локальный SQLite outbox и повторяются с тем же `client_message_id`.

Работы, требующие production-инфраструктуры, начинаются только после отдельного решения о сервере и секретах. До того можно сделать локальный каркас, UI, модель данных, offline queue и детерминированные тесты без production endpoint/ключей.

### APP-013L — локальная очередь и отправка (до ADR-002 gate)
- **Статус:** локальная часть APP-013, разрешена до ADR-002; production-сервер, реальные endpoint'ы, ключи и сетевые вызовы запрещены.
- **Что делает:** composer создаёт UUID `client_message_id`; в одной SQLite-транзакции сохраняет message и outbox; bubble сразу виден со статусом «В очереди». Локальный debug-only fake transport выдаёт ack, не являясь сетью. Worker соблюдает single-flight для outbox item, timeout 30 секунд и backoff; kill/restart не теряет queued item. При `offline` попытки не выполняются; при возвращении сети очередь автоматически обрабатывается по порядку.
- **Критерий приёмки:** тесты на настоящем SQLite покрывают отправку, offline → online, порядок, single-flight/timeout, отсутствие потери после restart и отсутствие дублей; UI не зависит от demo data как источника истины.

### APP-014L — локальные статусы и повтор (до ADR-002 gate)
- **Статус:** локальная часть APP-014, разрешена до ADR-002; server ack, delivered и read не реализуются здесь.
- **Что делает:** статусная модель `queued → sent` и `not_sent`; fake debug transport позволяет детерминированно получить sent/error. Для `not_sent` UI показывает «Повторить»; retry использует тот же `client_message_id` и не создаёт второй message/outbox item. Bubble имеет часы для queued, галочку для sent, красный восклицательный знак для not_sent и русскоязычные accessibility labels.
- **Критерий приёмки:** тесты на настоящем SQLite покрывают retry без дублей и restart; delivered/read не появляются по догадке UI и остаются серверной частью APP-014.

### Локальные UX-доработки до ADR-002 gate

Следующие четыре задачи разрешены как **локальные**, не требуют production-инфраструктуры и не открывают APP-007+ либо реальный adapter:

- **APP-014L-05 — keyboard-safe chat:** Android `softwareKeyboardLayoutMode: resize`; composer и последние сообщения остаются над клавиатурой; список прокручивается к последнему сообщению после собственной отправки и открытия клавиатуры у нижней границы, но входящее не сдвигает пользователя, читающего историю.
- **APP-014L-06 — local test-mode build:** только точный build-флаг `EXPO_PUBLIC_LOCAL_TEST_MODE=1` включает demo seed и локальный fake ack transport; без флага release остаётся без них. В Settings тестовой сборки видна надпись «Тестовая сборка». Такие APK предназначены только для внутренней проверки, не для родственников.
- **APP-014L-07 — persistent composer drafts:** SQLite-черновик на chat ID переживает выход из чата и restart, очищается только после успешного enqueue отправки; тесты используют настоящую SQLite там, где доступна база.
- **APP-014L-08 — local date separators:** в локальной переписке показываются «Сегодня», «Вчера» либо русская дата по local civil time; timezone boundary и порядок разделителей покрыты тестами.
- **APP-014L-14 — conversation correctness:** локальная прокрутка после собственной отправки с открытой клавиатурой всегда показывает новый bubble целиком; одно local civil time телефона применяется для `sent_at`, bubble, списка чатов и date separator. Delivery UI имеет ровно один визуальный индикатор: часы `queued`, одна галочка `sent`, `CheckCheck` для будущего `delivered` и акцентный `CheckCheck` для будущего `read`, без дублирующих check. Тесты используют настоящую SQLite-базу там, где хранится сообщение, и фиксированные зоны `Europe/Istanbul`/`Asia/Ashgabat`.
- **APP-014L-15 — draft preview in chats:** локальный SQLite-черновик отображается в списке как акцентное «Черновик:» и текст, не изменяя сортировку чатов по `last_message_at`.
- **APP-014L-16 — message actions and reply gestures:** локальные long-press actions (Reply/Copy/Trash2) с доступным закрытием tap-outside и reply swipe-right с краткой `expo-haptics` feedback; никаких сетевых вызовов.
- **APP-014L-17 — local chat search:** верхняя лупа открывает поиск по имени чата и тексту локальных сообщений из SQLite, с детерминированными SQLite-тестами.
- **APP-014L-18 — maintained clipboard boundary:** устаревший React Native Clipboard заменён на SDK-bundled `expo-clipboard`; copy action закрывает меню при успехе, показывает доступную ошибку при сбое и покрыт тестами границы.
- **APP-014L-19 — v0.6.7 localtest release:** только после локального принятия APP-014L-14…18: versionName `0.6.7`, новый Android versionCode, тестовая сборка ARM64 с `EXPO_PUBLIC_LOCAL_TEST_MODE=1`; вручную проверяется обновление поверх 0.6.6 без потери SQLite-данных. APK собирает Hermes через `scripts/build-localtest-apk.sh` и проверяет встроенный флаг.

### ADR-002 — обязательный gate сервера и доменов перед APP-007

До начала **APP-007 и любой последующей server/production-задачи** должно быть письменно принято отдельное ADR-002 и дано отдельное разрешение на продолжение. ADR-002 обязан зафиксировать решение по спецификации: self-hosted Supabase на выбранном VPS, Caddy/TLS на 443 и безобидный сайт на корне, разделение тихого сервера сообщений и ретрансляторов, основную/тихую точки входа на разных доменах, 2–3 резервных домена и утверждённые источники обновления endpoint list. Без этого gate нельзя создавать production server/domain, подключать реальный adapter или начинать APP-007+.

## Переиспользование UI Preview

**Оставляем и переносим в реальные экраны:** русский визуальный язык «Чё-Там», темы/токены, верхние шапки, нижнюю навигацию, rows чатов/семьи, аватары, bubbles, composer, поиск, счётчики непрочитанного, accessibility и safe-area геометрию. Временные mock-звонки не расширяются.

**Заменяем:** `src/ui/demoData.ts` и in-memory state перестают быть источником истины. Реальные списки, сообщения, profile, unread, delivery state и connection state поступают из локальной SQLite проекции и синхронизации. Mock-send заменяется persistent outbox; mock connection/call state — реальным состоянием сети и транспорта. Demo login заменяется сессией и invite flow.

## Фаза 1 — фундамент

### APP-001 — разделить preview UI и приложение, ввести модули домена
- **Что делает:** создаёт минимальную структуру `src/screens`, `src/components`, `src/lib`, `src/hooks`, `src/types`, `src/transport`, `src/messages`; сохраняет существующий UI как shell без сетевых вызовов. Описывает типы домена: профиль, чат, сообщение, receipt, endpoint, connection state, outbox item. Никаких серверов, ключей, авторизации или звонков.
- **Файлы:** `App.tsx`; новые файлы в перечисленных `src/*`; чистые unit-тесты; `docs/tasks/APP-001-*.md`.
- **Критерий приёмки:** текущая навигация/темы/поиск/список чатов визуально не регрессируют; типы не используют demo-only delivery boolean как источник истины; обязательные чистые unit-тесты доменных типов/границ модулей, lint/test/typecheck проходят.
- **Проверка в Турции:** открыть APK, переключить все четыре вкладки, открыть чат, использовать поиск, светлую/тёмную тему и системную кнопку Back; убедиться, что вид и переходы не хуже v0.5.2.

### APP-002 — локальная SQLite-схема и миграция
- **Что делает:** добавляет локальную БД и миграцию с таблицами/индексами для профиля, чатов, сообщений, receipts, cursor синхронизации, endpoint cache и outbox. Хранит `client_message_id` уникально и данные, достаточные для восстановления UI без сети. Без реального API.
- **Файлы:** `src/storage/**`, `src/types/**`, тесты миграции/repository; минимальная интеграция app bootstrap.
- **Критерий приёмки:** обязательные автоматические migration/repository-тесты доказывают: чистая установка создаёт схему; повторный запуск сохраняет тестовые локальные данные; повторная вставка одного `client_message_id` не создаёт вторую запись; миграция не уничтожает данные предыдущей схемы.
- **Проверка в Турции:** установить APK, открыть чаты, закрыть приложение из списка последних, открыть снова; увидеть те же локальные данные/экран, без зависания или падения. Данные ещё демо-инициализированы, но уже читаются через SQLite.

### APP-003 — repository, UI real-data adapter и phone verification
- **Что делает:** переводит Chats и Conversation с `demoData` на SQLite repository/observable state; вводит явные empty/loading/error состояния и объединяет phone verification с этим адаптером/локальным flow. Demo seed остаётся только как development fixture, не как UI source of truth.
- **Файлы:** `src/messages/**`, `src/storage/**`, `src/screens/**`, `src/components/**`, phone-verification UI/state, удаление прямого чтения `demoData` в рабочих экранах, обязательные автоматические тесты selectors/repository/phone-verification.
- **Критерий приёмки:** список сортируется по локальному `last_message_at`, unread считается из локальной БД, экран чата показывает локальные сообщения; phone verification покрыта автоматическими тестами своего локального flow; empty state понятен на русском; никакого HTTP/WS. После APP-001–003 собирается один общий APK на все три задачи.
- **Проверка в Турции:** на чистой установке увидеть понятный пустой/тестовый локальный экран; пройти локальный сценарий phone verification; открыть чат, вернуться назад, проверить сортировку и unread; включить авиарежим и повторить — интерфейс продолжает открываться.

### APP-004 — модель состояния связи и плашка чата
- **Что делает:** добавляет локальную state-machine: `offline`, `connecting`, `online`, `degraded`, `retrying`; показывает в шапке открытого чата простую плашку («Нет сети», «Восстанавливаем связь», «На связи»). Источник пока NetInfo + transport interface, без постоянного WebSocket.
- **Файлы:** `src/transport/connectionState.ts`, `src/hooks/**`, header/chat components, тесты переходов.
- **Критерий приёмки:** отсутствие сети не маскируется как ошибка отправки; плашка доступна screen reader; переходы состояний детерминированно покрыты тестами.
- **Проверка в Турции:** открыть чат, включить авиарежим — увидеть «Нет сети»; выключить — увидеть «Восстанавливаем связь», затем «На связи» или понятный retry; приложение не теряет локальный экран.

### APP-005 — transport interface, endpoint policy и backoff без production подключения
- **Что делает:** вводит единый интерфейс транспорта, endpoint policy (приоритет/резерв) с сохранением last-known-good endpoint, и интерфейс обновления endpoint list с детерминированным fake для тестов. Вводит локальный bytes counter по endpoint/направлению трафика, различает `offline`, обычный endpoint failure и отдельную категорию `address_blocked`; последняя выставляется при DNS-ответе `127.0.0.1`, `0.0.0.0` или иной обнаруженной DNS-подмене и никогда не маскируется как offline. Добавляет exponential backoff с jitter и ceiling. Реальный transport подменяется fake в тестах; production адресов, FCM и WebSocket ещё нет.
- **Файлы:** `src/transport/**`, `src/config/**`, тесты policy/backoff, endpoint-list update fake, DNS/address-blocked classification и bytes counter.
- **Критерий приёмки:** все будущие синхронизация/отправка зависят только от одного transport interface; last-known-good endpoint переживает restart и выбирается прежде менее приоритетных резервов, пока не доказанно недоступен; тесты доказывают обновление endpoint list через fake, порядок задержек, учёт байтов и отказ от попыток без сети; DNS `127.0.0.1`/`0.0.0.0`/подмена дают именно `address_blocked`, а не `offline`; счётчик попыток не busy-loops.
- **Проверка в Турции:** в debug diagnostics экране (без адресов и секретов) увидеть текущий статус связи, last-known-good endpoint, bytes counter и следующую задержку retry; при авиарежиме не растёт бесконечный счётчик попыток/батарея не расходуется заметно; при test DNS-подмене показана отдельная понятная категория блокировки адреса, не «Нет сети».

## Фаза 2 — доступ

### APP-006 — auth contract и безопасная локальная сессия
- **Что делает:** определяет контракт invite/register/login/session/device binding, secure local storage abstraction и защищённую навигацию; screen implementation использует fake transport до отдельной серверной задачи. Не хранит пароль в SQLite/logs.
- **Файлы:** `src/auth/**`, `src/storage/session*`, `src/screens/auth/**`, тесты reducers/validation/navigation.
- **Критерий приёмки:** в app code есть ровно один session interface; logout очищает session-only данные; protected app route не открывается без session; русский текст ошибок/валидации.
- **Проверка в Турции:** пройти локальный демонстрационный вход без сети; выйти; убедиться, что защищённые экраны не открываются до повторного входа. Это ещё не настоящий аккаунт.

### APP-007 — серверная схема: profiles/chats/messages/receipts/endpoints
- **Что делает:** после отдельного утверждения инфраструктуры добавляет versioned SQL migrations для необходимых таблиц и индексов, включая уникальный `messages.client_message_id`, per-chat sequence/cursor и `message_receipts`; создаёт чистый локальный/dev migration test. Медиа, calls и storage buckets не входят.
- **Файлы:** `supabase/migrations/**` (или выбранный утверждённый server path), schema test tooling, документация запуска.
- **Критерий приёмки:** миграция применима с нуля и повторно безопасна; уникальность client ID доказана тестом; схема даёт упорядоченную догрузку после cursor.
- **Проверка в Турции:** Hermes выдаёт APK только после server acceptance; на телефоне проверить, что приложение открывает экран входа и показывает понятную диагностику, когда сервер недоступен. Регистрацию на реальном семейном invite выполнять лишь после отдельного разрешения.

### APP-008 — RLS и server-side invite redemption
- **Что делает:** добавляет RLS и `redeem-invite` transaction: инвайт погашается ровно одним человеком; участник не видит чужие chats/messages; заблокированный пользователь не отправляет; device/session contract подготовлен.
- **Файлы:** migrations/policies/functions, SQL integration tests, auth transport adapter.
- **Критерий приёмки:** два конкурентных redemption дают один success; чужой профиль не читает сообщения; server rejects forged sender; все тесты проходят на чистой БД.
- **Проверка в Турции:** использовать один тестовый invite на одном устройстве; убедиться, что регистрация/вход дают русский результат. Вторую попытку тем же кодом делать только на тестовом аккаунте — она должна показать «код уже использован», без падения.

### APP-009 — реальный login/register/session UI
- **Что делает:** заменяет fake auth transport на утверждённый server adapter, добавляет register/invite/login/logout/error diagnostics и защищённую навигацию. Не добавляет FCM/foreground WS/звонки.
- **Файлы:** `src/auth/**`, `src/transport/**`, auth screens/components, тесты contract/error mapping.
- **Критерий приёмки:** «invite → registration → logout → login» работает; сессия переживает перезапуск; offline/error states не уничтожают введённые данные; пароль/токен не попадает в журнал.
- **Проверка в Турции:** на тестовом invite пройти полный цикл; включить авиарежим перед submit — увидеть «Нет сети» и сохранённый ввод; вернуть связь и повторить вручную.

### APP-010 — привязка одного устройства и принудительный logout
- **Что делает:** реализует approved server contract active device ID и реакцию клиента на завершение сессии на другом устройстве; локально очищает только session-sensitive state, сообщения не удаляет.
- **Файлы:** auth/session transport, secure storage, protected navigation, tests.
- **Критерий приёмки:** login второго устройства инвалидирует первое в пределах server policy; первое показывает понятный экран, не циклически retry; локальный cache доступен только в рамках выбранной privacy policy.
- **Проверка в Турции:** использовать два тестовых телефона; войти вторым, на первом дождаться экрана «Вход выполнен на другом устройстве» и проверить, что нет краша/утечки текста на auth screen.

## Фаза 3 — базовая переписка

### APP-011 — sync protocol: cursor, pull и локальная проекция
- **Что делает:** реализует pull изменений «после последнего sequence/cursor» при login, ручном refresh, восстановлении сети и FCM wake-up; применяет записи атомарно в SQLite и дедуплицирует по stable server ID/client ID. Для каждой sync page фиксирует bounds: `page_size` только в диапазоне 20–100 записей, default 50; ответ или соединение на high-latency канале получает timeout 30 секунд и затем один backoff-managed retry, без параллельных/фоновых polling-запросов. В обычном режиме не открывает постоянный socket.
- **Файлы:** `src/messages/sync/**`, storage repositories, transport contracts/adapter, tests с прерыванием/повтором, page-size bounds и high-latency timeout.
- **Критерий приёмки:** повтор одной sync page не дублирует сообщения; offline cache открывается; после восстановления приходят пропущенные записи в порядке; `page_size` вне 20–100 отклоняется/нормализуется тестами, high-latency timeout не порождает лишних параллельных запросов; FCM handler только пробуждает одну дедуплицированную sync и создаёт видимое notification по ADR-001.
- **Проверка в Турции:** два телефона, один временно в авиарежиме. Отправить текст с первого, вернуть сеть на втором, открыть приложение/потянуть refresh — увидеть одно сообщение, без дубля. Проверить, что постоянного уведомления в нормальном режиме нет и что на медленном канале не возникает фоновый поток повторных запросов.

### APP-012 — реальный список чатов и unread/read receipts
- **Что делает:** подключает Chat list к SQLite проекции и sync: сортировка, latest preview, unread, read cursor/receipt; добавляет pull-to-refresh и empty/offline state. Свайпы/архив — только если в схеме и API готовы; иначе отдельная задача.
- **Файлы:** chat repositories/selectors, Chats screen/components, sync/receipts, tests.
- **Критерий приёмки:** новое синхронизированное сообщение поднимает чат наверх без restart; unread уменьшается после открытия/read ack; UI не показывает mock data.
- **Проверка в Турции:** отправить с телефона A на B; на B открыть список — увидеть счётчик и новый чат сверху; открыть чат — счётчик исчезает; на A после sync появляется delivered/read в соответствии с реальным receipt.

### APP-013 — outbox и оптимистичная текстовая отправка
- **Статус:** локальная часть выполнена в APP-013L; остаётся production transport и server ack после ADR-002 gate.
- **Что делает:** production-transport сохраняет контракт APP-013L: UUID `client_message_id`, транзакционная запись message+outbox, статус «В очереди», 30-секундный timeout, single-flight и backoff. Успешный **server ack** переводит сообщение в «Отправлено» без замены ID; повторный submit/transport retry использует тот же ID.
- **Файлы:** outbox repository/worker, message send use-case, Conversation/composer, tests idempotency/crash recovery, high-latency timeout и single-flight retry.
- **Критерий приёмки:** kill/restart после нажатия send не теряет message; несколько retry дают одну server message; в UI нет двойного bubble; тесты доказывают 30-секундный timeout и отсутствие параллельных либо бессмысленных фоновых send/retry для одного outbox item.
- **Проверка в Турции:** открыть чат, включить авиарежим, отправить короткий текст — увидеть «В очереди»; закрыть/открыть приложение — bubble остаётся; вернуть сеть — сообщение уходит ровно один раз на второй телефон; на медленном канале не возникает серии одновременных отправок.

### APP-014 — delivery/read states и ручной повтор ошибки
- **Статус:** локальная часть `queued → sent → not_sent`, ручной retry и UI выполнены в APP-014L; остаются server ack и статусы delivered/read, которые приходят только от получателя/сервера.
- **Что делает:** после ADR-002 production transport заменяет debug fake в существующем контракте. Реализует `delivered → read` только по подтверждениям получателя/сервера; не выводит их по догадке UI. Окончательная ошибка остаётся `not_sent` с доступной кнопкой «Повторить», не создающей новый ID.
- **Файлы:** message/outbox models, repositories, Conversation bubble/status components, tests state transitions and retry identity.
- **Критерий приёмки:** каждый статус имеет отдельный русскоязычный accessibility label; retry на `not_sent` сохраняет `client_message_id`; delivered/read приходят только из подтверждений получателя/сервера, не по догадке UI.
- **Проверка в Турции:** искусственно отключить endpoint/сеть до исчерпания короткого тестового retry policy — увидеть «Не отправлено» и «Повторить»; нажать после восстановления связи; на другом телефоне сообщение появляется один раз, его status проходит до «Прочитано» после открытия.

### APP-015 — reconnect, endpoint fallback и chat connection banner
- **Что делает:** подключает transport policy к реальному sync/outbox; при active transport disconnect делает exponential reconnect с jitter, перебор approved endpoints и последующий sync. Для FCM-не-доставки реализует fallback mode из ADR-001: foreground WebSocket и тихое постоянное уведомление только пока этот режим включён; события по FCM и WS дедуплицируются по stable ID. Fallback включается при любом из двух сигналов: (1) server flag о недоставленном FCM, который сервер присылает **при каждом sync** как дополнительный сигнал; (2) локальное обнаружение, что cursor sync нашёл не менее **3** сообщений без соответствующих локально учтённых push за последние 24 часа. Локальный счётчик очищается после успешного соответствующего push/окна оценки; sync, reconnect и fallback работают single-flight, без постоянного polling или иных лишних фоновых запросов. Для high-latency sync/reconnect применяется timeout 30 секунд и существующий backoff.
- **Файлы:** `src/transport/**`, Android/Expo notification and foreground-service integration only as approved, sync/outbox worker, connection banner, tests with fake clock/transport, local missing-push threshold, server flag every sync, timeout/single-flight.
- **Критерий приёмки:** normal mode не держит persistent WS и notification; fallback включается по server flag из любого sync либо локально при пороге ≥3 синхронизированных сообщений без push за 24 часа; server flag не является единственным источником решения; reconnect не создаёт дубликат/две параллельные очереди или лишние background requests; high-latency timeout равен 30 секундам и покрыт fake-clock тестом; после reconnect выполняется cursor sync; banner отражает состояние.
- **Проверка в Турции:** в нормальном режиме отправить/получить тестовый текст — нет постоянной плашки Android «на связи». В тестовой server-controlled fallback simulation и отдельно в локальной simulation с тремя найденными sync сообщениями без push увидеть тихое постоянное уведомление и chat banner «Восстанавливаем связь/На связи»; отключить сеть, вернуть — отправленный offline текст приходит один раз, без потока фоновых запросов.

### APP-016 — FCM receive, notification и sync handoff
- **Что делает:** добавляет Android FCM registration, token refresh, high-priority message notification и safe payload containing only stable IDs/type; обработчик вызывает cursor sync, не принимает message body как единственный источник истины. Calls не включаются.
- **Файлы:** notification module, Android config/native glue as required, transport registration, sync handoff, tests payload validation/dedup.
- **Критерий приёмки:** notification видимое по message push; opening it opens correct chat after sync; duplicate/missing push не создаёт duplicate message; FCM failure leaves outbox/reconnect paths operational.
- **Проверка в Турции:** при закрытом приложении отправить текст с другого телефона, получить обычное notification; открыть его — увидеть один актуальный чат/message. Отключить Google services/сеть или использовать test switch FCM unavailable — после открытия приложения/восстановления транспорта cursor sync всё равно подтягивает сообщение.

## Общие проверки каждой реализации

Hermes до commit/APK запускает соответствующие unit/integration tests, `npm run lint`, `npm test`, `npm run typecheck`, release build, APK integrity/signature verification и SHA-256. Не прошедшая сборка или тест возвращается Фатиме для исправления: Hermes production code не патчит.

Каждая задача фиксирует в отчёте: изменённые файлы, сетевой трафик/его отсутствие, автоматические проверки, SHA-256 APK и точные телефонные шаги. Новая задача не начинается без явного принятия предыдущей.
