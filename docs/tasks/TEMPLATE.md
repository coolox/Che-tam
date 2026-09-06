# Task: <short title>

- **ID:** `T-001`
- **Status:** draft | approved | in_progress | review | accepted | blocked
- **Owner:** Hermes
- **Implementation agent:** Codex CLI

## Goal

Describe the user-visible outcome in one or two sentences.

## Context

Link the relevant headings in `../spec.md` and record any decisions made after the specification.

## Allowed scope

- Files/directories Codex may create or modify:
- Files/directories that must not change:

## Requirements

- [ ] Requirement 1
- [ ] Requirement 2

## Acceptance criteria

- [ ] Observable behavior that proves the task is complete
- [ ] Tests pass
- [ ] No secrets, runtime data, generated dependencies, or unrelated changes enter Git

## Verification

```bash
# Exact commands Hermes will independently run after Codex finishes.
```

## Constraints

- No deployment, infrastructure changes, external messages, or external write APIs.
- No unrelated dependency upgrade or refactor.
- Stop and report a blocker rather than guessing product behavior.

## Codex prompt

Hermes generates the final prompt from this task, `AGENTS.md`, and the repository state. Codex must return a concise report with changed files, tests, and known risks.
