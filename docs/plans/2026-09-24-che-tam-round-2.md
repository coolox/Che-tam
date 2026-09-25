# Чё-Там — план выполнения round 2 малыми задачами

> **Для Hermes:** выполнять строго последовательно: одна задача → независимая проверка diff/lint/test/typecheck → краткий отчёт Арслану → только затем следующая. Фатиме передавать **только один** task-файл за запуск. APK не собирать до принятия всего раунда и отдельного одобрения Арслана.

**Goal:** исправить переписку, mock-звонки и вкладку «Звонки» в офлайн UI Preview без реальных устройств, разрешений, сети или бэкенда.

**Architecture:** UI Preview остаётся в `App.tsx` с чистыми детерминированными данными/хелперами в `src/ui/` и фокусными Jest-тестами. Все иконки — установленный `lucide-react-native`; IME — уже установленный `react-native-keyboard-controller`. Это исключает dependency churn и экономит токены.

**Tech stack:** Expo 57, React Native 0.86, TypeScript, Jest, `react-native-safe-area-context`, `react-native-keyboard-controller`, `lucide-react-native`.

---

## Порядок задач

| Очередь | Task | Что меняет | Пропускать нельзя, потому что |
|---:|---|---|---|
| 1 | `UI-013A-chat-layout-header.md` | IME/bottom anchor + header | composer зависит от корректного размера чата |
| 2 | `UI-013B-composer-and-bubbles.md` | composer, пузыри, статусы, события | строится поверх готового layout из A |
| 3 | `UI-013C-call-screens.md` | video/audio mock call screens | изолировано от чата, не конфликтует с B |
| 4 | `UI-013D-calls-log.md` | журнал звонков и mock callbacks | callbacks используют согласованный call flow из C |

## Правило передачи Фатиме

Для каждой задачи Hermes:

1. Сверяет чистоту рабочего дерева и читает только текущий task-file + нужные исходники.
2. Запускает Фатиму через `codex exec --approve-for-me -C /root/projects/che-tam` с одним коротким указанием: прочитать и выполнить **только** конкретный файл.
3. Фатима не делает build/prebuild/Gradle/эмулятор/устройство и не коммитит.
4. Hermes проверяет `git diff --stat`, `git diff --check`, отсутствие Canary/секретов/лишних файлов, затем независимо запускает:
   ```bash
   npm run lint
   npm test
   npm run typecheck
   ```
5. При зелёной проверке — кратко отчитывается Арслану; следующая задача не запускается в том же Codex-запуске.
6. Если lint/test/typecheck или review находят дефект, запускается только точечная задача-фикс для текущей очереди; дальше не идти.

## Gate после UI-013D

Только после принятия всех четырёх задач Арсланом:

1. Hermes собирает ARM64 APK вручную, не Фатима.
2. Hermes проверяет archive, подпись, package/version и embedded JS bundle.
3. APK отправляется Арслану с объединённым чеклистом физической проверки: клавиатура, composer, bubbles, оба звонка, Calls tab, safe areas.
4. Commit — только после явного `ok` Арслана.

## Source task

`UI-013-chat-and-calls-round-2.md` — исходная полная формулировка. После принятия `UI-013A`…`UI-013D` этот файл можно обновить как superseded/completed только отдельной документационной задачей.
