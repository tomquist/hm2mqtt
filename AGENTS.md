# AGENTS.md

Guidance for AI coding agents working in this repository.

## Goal

Make safe, reviewable changes to `hm2mqtt` with minimal back-and-forth.

## Repository Context

- Main runtime: TypeScript + Node.js
- Home Assistant add-on files: `ha_addon/`
- User docs: `README.md`
- Release notes: `CHANGELOG.md`

## Branch & PR Policy

- **Always branch from `develop`** for feature/fix work.
- **Always target PRs to `develop`** (not `main`) unless explicitly instructed otherwise.
- Keep PRs focused and small; avoid unrelated changes.

## Before You Open a PR (Validation Checklist)

Run locally:

```bash
npm run lint          # oxlint
npm run format:check  # oxfmt
npm test -- --runInBand
npm run build
```

Use `npm run lint:fix` and `npm run format` to apply fixes.
Requires Node `^20.19.0 || >=22.12.0` (see `engines` in `package.json`).
Node 18 is not supported.

If add-on behavior/config was changed, also validate add-on config consistency:

- `ha_addon/config.yaml` options and schema are in sync
- environment wiring in `ha_addon/run.sh` is in sync

## Required Consistency Checks

When adding/changing configuration options (env vars or add-on options), update **all relevant places**:

1. Runtime parsing (`src/index.ts`, `src/types.ts`, constants if needed)
2. Add-on config (`ha_addon/config.yaml`)
3. Add-on startup mapping (`ha_addon/run.sh`)
4. Tests/fixtures (all `MqttConfig` fixtures etc.)
5. Documentation (`README.md`)
6. Translations (`ha_addon/translations/en.yaml`, `ha_addon/translations/de.yaml`)
7. `CHANGELOG.md` under `[Next]`

## Configuration Change Quality Gate

For every new or changed config option, treat the following as mandatory completion criteria:

- Add-on translations (`ha_addon/translations/en.yaml` and `ha_addon/translations/de.yaml`)
- Changelog entry under `[Next]` in `CHANGELOG.md`
- Updates to all TypeScript test fixtures that construct `MqttConfig`

## Changelog Style

`CHANGELOG.md` is read by users, not developers.

- Describe what the user saw and what changed for them, in a few sentences.
- No internals: file, function or symbol names, data structures, code paths. If
  a sentence only makes sense with the diff open, it belongs in the commit
  message instead.
- End with the issue reference, plus the PR number once it exists:
  `(fixes #123, PR #124)`.

## Coding & Change Style

- Prefer minimal, surgical changes over broad refactors.
- Keep naming aligned with existing style (`topicPrefix`, `...TopicPrefix`, etc.).
- Preserve backward compatibility unless the task explicitly requires breaking change.
- If a default value is introduced, define it once in constants where appropriate.

## PR Quality Bar

PR description should include:

- What changed
- Why it changed
- How it was validated (commands run)
- Linked issue (e.g. `Closes #248`) when applicable

## Safety Rules

- Never commit secrets, tokens, or private credentials.
- Do not perform destructive operations unless explicitly requested.
- Do not silently modify unrelated files.
