# Task: Welcome and demo entry

- **ID:** `UI-002`
- **Status:** `planned`
- **Owner:** Hermes
- **Implementation agent:** delegated coding agent

## Goal

Add an elegant Russian welcome screen and local demo entry. No real account is created.

## Requirements

- Friendly welcome with concise explanation of a private family space.
- `Посмотреть демо` enters preview; `Как это работает` expands local explanation.
- First entry state is held only locally in memory; no persistence or authentication.
- Design remains simple, original and accessible.

## Acceptance criteria

- Tapping `Посмотреть демо` switches to the chats preview.
- No new permissions or network dependencies.
- Focused tests and full lint/test/typecheck pass.
