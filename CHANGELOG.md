# Changelog

## 0.2.0

Process the inbox from any computer.

- Processing state (cursor, pending reactions, follow-up question, last lint, last run) moved from `~/.second-brain/state.json` into the vault at `.kb/state.json`, synced by iCloud. Migrated automatically.
- Version history is optional (`version_history` in 我的设置.md, off by default). When on, each computer keeps its own history in `~/.second-brain/vault.git` via `--work-tree`; the vault holds no `.git`. `kb upgrade` removes the v0.1.0 `.git` pointer file.
- `kb status` warns when another computer processed the vault in the last 10 minutes; `kb lint` reports conflict copies of the state file.
- `/setup` can attach a second computer to an existing vault.

## 0.1.0

First usable release (P0–P4 in docs/TECH.md).

- `kb` CLI: pull, fetch, file, index, lint, react, commit, status, question, init, upgrade, config — every command prints one JSON object.
- Feishu inbox: chat history with cursor and dedupe, attachments, emoji reactions.
- Link fetching: direct request, then a real Chromium via Playwright; WeChat articles supported; failures listed for manual clipping.
- Vault template: CLAUDE.md rules, four page templates, settings, and the inbox / ask / review / lint / setup skills.
- Vault history kept outside iCloud with `git --separate-git-dir`.
