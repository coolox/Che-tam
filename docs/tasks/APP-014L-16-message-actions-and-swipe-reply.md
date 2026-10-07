# APP-014L-16 — современное меню сообщения и swipe reply

- **Статус:** approved by Arslan, 2026-10-07. APP-014L-15 accepted as `67e0d6e`.
- **Граница:** local UI only. Do not build APK/Gradle/prebuild, change server/network/ADR-002/secrets/bots/build scripts, commit or push.

## Цель

Доработать уже имеющиеся long press actions и reply до современного мобильного поведения.

## Требования

1. Long press: затемнённый (при поддержке платформой — визуально мягко размытый) backdrop, выбранный bubble визуально выделен, рядом с ним компактная карточка с Lucide `Reply`, `Copy`, `Trash2`; плавная enter/exit animation; tap outside закрывает. Не ломать confirm delete, accessibility и существующее copy/reply/delete.
2. Swipe right по bubble: показать affordance «Ответить»; при достижении порога однократно вызвать лёгкий haptic через `expo-haptics`, затем отпустить — установить тот же reply target, что action menu. Не срабатывать на vertical scroll, не делать reply при коротком swipe, не вызывать haptic повторно в пределах одного gesture.
3. Если `expo-haptics` отсутствует, добавить его штатно без обновления прочих зависимостей. Проверить installed Expo-compatible version. Не использовать deprecated Clipboard.
4. Extract deterministic pure gesture threshold/reducer helper and test threshold/vertical/cancel/one-haptic behavior. Existing message action state tests stay green.

## Разрешено

Minimal existing `src/app/screens/ConversationScreen.tsx`, its sibling helpers, `src/ui/state.ts` only if required, targeted tests, `package.json`/lock only if adding expo-haptics, this task file.

## Проверки

Targeted tests + `npm run lint`, full `npm test -- --runInBand`, `npm run typecheck`, `git diff --check`. Final report exact rollout JSONL.