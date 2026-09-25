# Task: UI-015 — главный экран: список чатов и множественное выделение

- **ID:** `UI-015`
- **Status:** `approved for implementation — Arslan explicitly requested Fatima execute UI-015 on 2026-09-25`
- **Priority:** high
- **Depends on:** user approval received; preserve unrelated current UI-014 cold-start/manual-test changes without touching protected paths.

## Goal

Переработать главный экран вкладки «Чаты» в оригинальный мессенджерный список с привычными паттернами, аналогичными WhatsApp: бесшовные строки чатов, ripple нажатие и режим множественного выделения. Это **визуальный офлайн preview**: только локальные demo-данные и in-memory UI-состояние.

## User-reported desired behavior

### 1. Строки вместо карточек

- Убрать отдельные карточки, рамки, внешние отступы и промежутки между чатами.
- Чаты идут единым списком на всю доступную ширину общего фона, **без разделительных линий**.
- Внутри каждой строки:
  - слева — круглая аватарка;
  - справа от неё — имя жирным и preview последнего сообщения строго одной строкой, с обрезанием `…`;
  - в правой верхней части — время;
  - под временем — зелёный круглый badge с числом непрочитанных только при `unreadCount > 0`;
  - метку профиля/трафика (например, «Экономный профиль», «Видео 240p») из строки убрать. Она остаётся только в настройках соответствующего чата.
- Не копировать фирменные графику, конкретные ассеты или точные визуальные размеры WhatsApp: использовать существующие Che-Tam tokens, оригинальные цвета, аватары и логотип.

### 2. Обычный тап

- Строка — доступная кнопка на всю ширину и с tap target не менее 48×48 dp.
- Обычный тап кратко даёт pressed/ripple-like затемнение **по всей ширине строки**, затем открывает локальный чат.
- Не добавлять нативную библиотеку ради ripple; использовать существующие React Native возможности, если этого достаточно.

### 3. Long press и множественное выделение

- Long press по строке включает selection mode и выделяет эту строку.
- Выделенная строка подсвечена от левого до правого края мягким зелёным оттенком в тоне приложения.
- На аватарке выбранной строки в правом нижнем углу появляется зелёный круг с иконкой `Check` из `lucide-react-native`.
- В selection mode обычный тап по другой строке добавляет её в выделение; повторный тап снимает выделение.
- Если снята последняя выбранная строка, selection mode автоматически завершается и возвращается обычная шапка.
- Обычная шапка заменяется на selection action bar:
  - слева: `ArrowLeft`, который отменяет selection mode;
  - рядом: число выбранных строк;
  - справа: `Pin`, `Trash2`, `BellOff`, `Archive`, `EllipsisVertical`.
- Во время preview действия иконок могут быть безопасными in-memory mock actions; они не должны удалять реальные данные, менять Canary, делать сеть, показывать разрешения или претендовать на настоящее архивирование/уведомления.
- Системная Android-кнопка Back и `ArrowLeft` отменяют selection mode и возвращают обычную шапку. Если selection mode не активен, сохранить уже принятый Back contract.
- Подсветка строки и индикатор Check появляются/исчезают короткой плавной анимацией; не использовать emoji/Unicode-заменители. Все функциональные иконки — только `lucide-react-native`.

## Allowed scope when approved

- `App.tsx` и непосредственно относящиеся модули локального UI state / demo data / UI types;
- `__tests__/uiPreview.test.ts` и/или отдельный focused test только для этого поведения;
- новый task/plan documentation only when required by this task.

## Strict non-goals / protected paths

- Никаких реальных сети, auth, WebRTC, камеры, микрофона, контактов, уведомлений, аналитики, файловой персистентности или разрешений.
- Никаких зависимостей/обновлений пакетов, Gradle/prebuild/APK/emulator/device действий со стороны исполнителя.
- Не менять Android native resources, manifest, splash, launcher, brand assets или `app.json`: они относятся к UI-014 и находятся в отдельном цикле cold-start проверки.
- Не менять Canary: `src/nativeMonitor.ts`, `src/storage.ts`, `src/exportJournal.ts`, `src/schedulePolicy.ts`, `src/types.ts` и native monitor code.
- Не изменять другие вкладки/экраны, composer, звонки или данные звонков, кроме минимально необходимой связки navigation/back state.

## Implementation constraints

- Перед любым изменением существующего файла создать timestamped `.bak` рядом с ним. **Не размещать backup-файлы внутри `android/app/src/main/res/`**: Android resource merger воспринимает их как ресурсы и ломает release build. Для native resources backup разрешён только вне `res/` (но UI-015 их не трогает).
- Использовать существующие централизованные design tokens; не рассыпать магические визуальные значения.
- Сохранить safe-area инcеты и все элементы вне зоны system navigation/gesture bar.
- Не запускать native build, prebuild, Gradle, APK, emulator, device или долгоживущий dev server. Это работа Hermes после отдельного одобрения пользователя.

## Acceptance criteria

- [ ] Chat list визуально состоит из сплошных full-width строк: без card shell, border, gap и divider между строками.
- [ ] Каждая строка показывает avatar, bold name, single-line ellipsized preview, time и conditional unread badge; profile/traffic label в строке отсутствует.
- [ ] Обычный tap имеет короткое full-width pressed/ripple-like состояние и затем открывает нужный локальный чат.
- [ ] Long press включает selection mode и показывает full-width green selection, overlay Check на avatar и action bar с точными Lucide icons: ArrowLeft, Pin, Trash2, BellOff, Archive, EllipsisVertical.
- [ ] В selection mode tap корректно toggles несколько строк; снятие последней автоматически выходит из режима.
- [ ] ArrowLeft и Android Back отменяют режим выделения; уже принятый Back contract за его пределами не сломан.
- [ ] Анимация выбора/галочки короткая и не использует emoji или текстовый substitute.
- [ ] Только offline/in-memory mock state; защищённые/внескоупные файлы не менялись.
- [ ] Focused tests охватывают state transition: long press → selection, toggle second chat, toggle last chat/exit, cancel via Back/ArrowLeft; lint, full Jest и typecheck проходят.

## Verification after approval

Implementation agent may run only:

```bash
cd /root/projects/che-tam
npm run lint
npm test
npm run typecheck
```

Hermes independently reruns:

```bash
git diff --check
npm run lint
npm test
npm run typecheck
```

Then require independent read-only review before acceptance. Release APK/manual device test only after the entire correction round is accepted and the user separately requests packaging.

## Deferred manual APK checklist

After a future build, verify on a physical Android device:

1. list has no cards/gaps/dividers at normal, larger-font and dark/light modes;
2. text preview remains one line and ellipsizes rather than colliding with time/badge;
3. pressed feedback covers the full row, then navigation opens the intended chat;
4. long press selection, multi-select and deselect-last are intuitive;
5. action bar icons and avatar Check are visible and stay clear of top/system insets;
6. Android Back cancels selection first and only then follows normal navigation;
7. all tap targets remain comfortable (≥48 dp) and no selected row or controls overlap the gesture area.
