# TASK-RESTORE-01 — Восстановление кода до v0.4.0

**Status:** approved for implementation  
**Assigned to:** Fatima (Codex)

## Контекст

Код v0.2–v0.4 был написан, но не закоммичен. Репозиторий сейчас на v0.1.0 (canary baseline). Требуется восстановить код до состояния v0.4.0 по спецификации из TASK-001b и TASK-001c.

## Текущее состояние (v0.1.0)

- `App.tsx` с базовым UI: статус, кнопки "Проверить сейчас", "Включить фоновый мониторинг", "Отправить журнал"
- `src/nativeMonitor.ts` — интерфейс к Android native модулю
- `src/storage.ts` — AsyncStorage для записей
- `src/exportJournal.ts` — создание JSON экспорта
- `src/schedulePolicy.ts` — throttle для ручной проверки
- `src/types.ts` — CanaryRecord типы

## Требуемые изменения (из TASK-001b, TASK-001c)

### 1. Scheduling corrections (TASK-001c)

**Проблема:** WorkManager и foreground service запускают дублирующие циклы проверок.

**Решение:**
- Добавить межпроцессный lease в SharedPreferences: `lastNativeCycleStartedAtUtc`, `lastNativeCycleCompletedAtUtc`
- WorkManager проверяет lease перед запуском; если foreground service активен, WorkManager пропускает цикл
- Foreground service обновляет lease перед началом и после завершения цикла
- Логировать пропущенные циклы как `testType: 'missed_cycle'`

**Файлы для изменений:**
- Android native код (Kotlin): `WorkManagerScheduler`, `ForegroundMonitorService`
- `src/nativeMonitor.ts` — поддержка новых полей lease

### 2. Persistent notification update (TASK-001c требование 4)

Persistent notification должно показывать:
- Статус: "Мониторинг активен" / "Ожидание следующей проверки"
- Время последней успешной проверки (UTC)
- Счётчик завершённых циклов

**Файлы:**
- Android `ForegroundMonitorService.kt` — обновление notification builder

### 3. UI text corrections (TASK-001c требование 5)

Изменить текст в `App.tsx`:
- "Включить фоновый мониторинг" → кнопка должна объяснять: "Мониторинг активен: примерно каждые 15 минут"
- Добавить disclaimer: "WorkManager интервал — примерный; точная периодичность — в foreground service"

### 4. Remove JS background fallback (TASK-001c требование 1)

Если в коде остался JS-запуск фоновых проверек (`background` executor), удалить его полностью. Только native Android scheduling.

**Файлы:**
- `src/background.ts` — проверить, есть ли JS-код, который эмулирует запуск проверок; удалить если есть

### 5. Test coverage (TASK-001c требование 6)

Добавить TypeScript unit-тесты:
- `schedulePolicy.test.ts` — проверка lease decision: должен ли WorkManager запускаться или пропустить цикл
- `missedCycles.test.ts` — расчёт пропущенных циклов по timestamps

**Инструменты:** Jest + ts-jest

## Verification (Fatima runs only these)

Fatima's task ends here — code + tests + lint/typecheck green. She must NOT run
`expo prebuild`, `gradlew`, any Android build/compile step, or touch a device/
emulator.

```bash
cd ~/projects/che-tam
npm run lint
npm test
npx tsc --noEmit
```

## Build and device verification (Hermes only, separate step)

After Fatima's code is reviewed and accepted, Hermes runs this directly in a
plain terminal call — no agent in the loop:

```bash
cd ~/projects/che-tam
npx expo prebuild --clean
./gradlew :app:assembleRelease
```

Then Hermes (or the user) installs on a physical device, runs for 1 hour, and
checks the journal for duplicate `checkRunKey` records and correct persistent
notification text.

## Acceptance criteria

✅ Нет дублирующих циклов в 1-часовом журнале (проверяется после сборки Hermes)
✅ Persistent notification показывает актуальный статус и время
✅ UI текст корректен: "примерно каждые 15 минут"
✅ JS background код удалён (если был)
✅ Unit-тесты проходят
✅ Release APK собирается без ошибок (сборка выполняется Hermes, не Fatima)

## Deliverables (from Fatima)

1. Изменённые файлы (список)
2. Результаты тестов (вывод `npm test`, lint, typecheck)
3. Подтверждение, что сборка/эмулятор/устройство не были запущены

## Deliverables (from Hermes, after Fatima's code is accepted)

1. Путь к собранному APK
2. Скриншот notification (если возможно через adb или manual)

## Notes

- Работай только в `/root/projects/che-tam`
- Не меняй `docs/spec.md` или файлы вне репозитория
- Не коммить автоматически; коммит сделает Hermes после приёмки
- **Fatima никогда не запускает build/prebuild/gradle/emulator/device — это
  всегда отдельный шаг Hermes.**
- Если нужна документация Android API (SharedPreferences, WorkManager), скажи — Hermes предоставит
