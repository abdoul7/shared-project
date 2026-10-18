# Project handoff

Read this file before making changes. Update it with every push so the next contributor or LLM can continue without the previous chat.

## Current state

- Repository: https://github.com/abdoul7/shared-project (private).
- This is a starter repository with `README.md` and `.gitignore`; no application code, dependencies, or tests exist yet.
- The product idea and first feature have not been chosen.
- `AGENTS.md` instructs coding agents to maintain this handoff before every push.
- Issa-14 was invited as a collaborator; acceptance was pending at the last check.
- The original local workspace is `C:/Users/abdou/Documents/ChatGPT/test`. Its Git remote is configured, but local Git authentication is not set up and it has not fetched the GitHub history. Browser sign-in alone did not authenticate command-line Git.

## Next steps

1. Accept the collaborator invitation, then clone the repository and open it in Codex.
2. Choose the product goal and first feature with the owner; do not assume an application stack yet.
3. Work on a separate branch and share changes through a pull request.
4. Update this file with the work, validation, blockers, and next steps before pushing.

## Update history

### 2026-10-19 — Add persistent LLM handoff

- Changes: added this handoff and `AGENTS.md` so future agents know to read and maintain it with every push.
- Files: `HANDOFF.md`, `AGENTS.md`.
- Validation: checked the starter README and ignore rules and confirmed there is no application to test. No automated tests were run for this documentation change.
- Known issues: command-line Git still needs authentication in the original workspace. Repository contains documentation only.
- Next: agree on the project goal, then implement the first feature on a branch.

## Format for future updates

Use a dated heading and include: changes and their purpose; relevant files; validation and results; known issues or unfinished work; and concrete next steps. Keep the current-state and next-steps sections synchronized with the latest update.
