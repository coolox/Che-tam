# Codex Operating Rules

## Role

You are the implementation agent. Hermes owns scope, architecture decisions, task lifecycle, review, tests, and acceptance. Implement only the approved task in `docs/tasks/`.

## Scope

- Read `docs/spec.md`, the active task file, and relevant source files before editing.
- Work only inside this repository and only on the active task.
- Do not modify files outside this repository.
- Do not make unrelated refactors, dependency upgrades, formatting sweeps, or generated-file churn.

## Secrets and external actions

- Never read, print, create, modify, commit, or request secrets, tokens, credentials, `.env` files, session files, private keys, databases, or production data.
- Never send messages, publish content, deploy, alter VPS services, change firewall rules, or call external write APIs.
- Use `.env.example` only for documented variable names, with no real values.

## Implementation process

1. State the files you expect to change and any assumptions.
2. Implement the smallest correct change that meets the acceptance criteria.
3. Add or update focused tests when behavior changes.
4. Run the verification commands in the task file.
5. Do not commit unless the task explicitly requests a commit.

## Required final report

Return:

- summary of the implementation;
- files changed;
- tests/verification commands run and exact outcome;
- assumptions, limitations, or follow-up risks.

Do not claim completion based only on code edits. Tests must run successfully or the failure must be reported.
