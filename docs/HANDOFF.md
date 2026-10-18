# Continuation checkpoint — 2026-10-19

Status: active implementation of slice A, not a finished communication suite.

- Repository: https://github.com/abdoul7/shared-project
- Branch/checkpoint/PR: not yet established; original local repo had no commits. Origin matches repository. Git fetch requires interactive authentication; a fetch sign-in is pending. Do not assume remote synchronization.
- Completed: starting-tree inspection; scoped Root PE reference inventory and sanitized evidence; security design written before communication protocol; plan and dependency choices.
- In progress: libsodium protocol/TLS relay and tests; isolated Electron desktop and OS-encrypted profile.
- Root reference: supplied local Root installation only; see ROOT_FINDINGS.md. Proprietary executable remains local, not committed. No private backend recovery claimed.
- Stack: Electron 44.9.0, libsodium-wrappers 0.8.4, ws 8.22.0, Node 24.15+. Dependencies pinned; lockfile pending install.
- Next three actions: implement protocol/desktop, run local real two-client TLS verification and desktop/build checks, checkpoint/push branch and draft PR if access permits.
- No streaming measurements; no file-transfer sizes tested; no voice/sharing/files/groups implemented. No cross-computer verification. No security audit.
- Encryption intent/limitations: SECURITY.md; crypto_box static keys, no forward secrecy/ratchet. OS DPAPI storage planned. No plaintext fallback.
- Setup/run commands will be finalized after actual verification. Planned npm ci, npm test, npm run check, npm run build, npm start; relay requires TLS cert/key and a reachable WSS endpoint.
- Environment variable names (no secrets): STILLROOM_PROFILE for separate desktop identities; relay configuration to be finalized with implementation. Production firewall/DNS/TLS certificate and operator-run relay required for two networks.
- Teammate: accept repository invite, clone feature branch after push, npm ci. Wait for verified relay/start instructions below before connecting. Public contact cards must be exchanged and verified through an existing authenticated channel.

## Previous starter history

Root HANDOFF.md retains the original collaboration setup updates. No previous application implementation was present; excluded systems are removed from scope.
