# Changelog

## 0.1.0

First usable release (P0–P4 in docs/TECH.md).

- `kb` CLI: pull, fetch, file, index, lint, react, commit, status, question, init, upgrade, config — every command prints one JSON object.
- Feishu inbox: chat history with cursor and dedupe, attachments, emoji reactions.
- Link fetching: direct request, then a real Chromium via Playwright; WeChat articles supported; failures listed for manual clipping.
- Vault template: CLAUDE.md rules, four page templates, settings, and the inbox / ask / review / lint / setup skills.
- Vault history kept outside iCloud with `git --separate-git-dir`.
