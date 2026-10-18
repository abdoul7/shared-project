# Stillroom

An original Windows-first private desktop communication project. **Experimental encrypted direct messages, peer voice/screen sharing, and resumable file transfers.** Private groups are not implemented. Cross-PC operation, physical audio devices and sustained 1440p60 remain unverified; this is not audited production software. No payment gates or subscriptions. See [project plan](docs/PROJECT_PLAN.md), [security design](docs/SECURITY.md) and [continuation handoff](docs/HANDOFF.md).

## Windows setup

Install Node.js 24.15 or newer and Git. Clone the repository after accepting the private collaborator invite, then switch to the feature branch identified in the handoff.

```powershell
npm ci
npm run check
npm test
npm start
```

If installation succeeds but Electron's executable is missing, run `node node_modules/electron/install.js`, then retry. Do not turn off TLS certificate validation.

## Local two-client trial

Start the TLS relay in a separate PowerShell terminal:

```powershell
.\scripts\dev-relay.ps1
```

Start two independent profiles in two more terminals:

```powershell
$env:STILLROOM_PROFILE='alice'
npm start
```

```powershell
$env:STILLROOM_PROFILE='bob'
npm start
```

For both windows: open Connection settings, use `wss://localhost:8443/`, choose `test/fixtures/localhost-cert.pem` as the private CA, and Connect. Each copies their public contact card, exchanges it through an authenticated channel, compares the **entire fingerprint**, and adds the other with explicit verification. Both approvals are required. Select the contact and send. Delivered means the recipient persisted and authenticated an acknowledgment; relay acceptance is insufficient.

The shared localhost TLS fixture/key is intentionally public test data, **never a production certificate or identity**. Real profiles and their keys are generated separately and protected with the OS account. Profiles live under `%APPDATA%/Stillroom/<profile>/snapshot.enc`. Losing the OS credential/profile loses identity and history. See SECURITY.md for DPAPI limitations and the absence of forward secrecy in this first slice.

## Connecting different computers/networks

For a hosted test relay with no VPN on either PC, see
[the free hosted-relay instructions](docs/HOSTED_RELAY.md) and `render.yaml`.
Render configuration is prepared but undeployed. The current Cloudflare route runs a temporary public tunnel to a relay on the host PC.

Current choice: [Cloudflare Quick Tunnel](docs/CLOUDFLARE_RELAY.md), after Render
required a payment card. Run `npm run relay:cloudflare` on the host PC and share
the printed WSS URL. The hostname is temporary and the host must remain awake.

An operator must run the TLS relay on a reachable host with a valid certificate for its DNS name. Obtain a certificate/private key using your normal trusted certificate workflow, keep the key outside Git, allow the chosen inbound TCP port, and configure:

```powershell
$env:RELAY_TLS_CERT='C:\secure\fullchain.pem'
$env:RELAY_TLS_KEY='C:\secure\privkey.pem'
$env:RELAY_HOST='0.0.0.0'
$env:RELAY_PORT='8443'
$env:RELAY_PUBLIC_URL='wss://relay.your-domain.example:8443/'
npm run relay
```

Both desktops use the exact same public URL. Use system trust for public certificates, or explicitly choose the operator's private CA PEM after authenticating it; never use the public test key for this. Firewall/router rules and public DNS/certificate ownership are external prerequisites; no host has been deployed by this repository. Cross-network behavior remains unverified until the two developers perform and record that test.

Only the relay's TLS private key belongs on the server; client identity private keys stay in encrypted desktop profiles. The relay sees routing metadata and ciphertext, not message contents. It currently keeps no offline mailbox. A sender must reconnect when the recipient is online to finish delivery; an encrypted durable outbox retries automatically. Disconnect/reconnect or restart either profile to exercise recovery. Do not run two instances of the same profile.

## Build and verification

For the prepared two-PC test build, follow [the streaming test procedure](docs/STREAMING_TEST.md).
The app shows a rolling minute of receiver measurements and can save a report
during or after a call. Default Cloudflare STUN helps direct network discovery;
networks that prevent direct calls may still require separately configured TURN.

Accept an incoming voice call before sharing a selected screen/window. Mute and
hangup controls stop local capture; screen sharing has a separate explicit picker
and stop control. The 1440p60 setting is a requested target; use actual receiver
statistics to assess quality. File offers require an explicit destination and never
overwrite an existing file. Partial transfers can be retried; the relay fallback
does not require an active call. Final publication currently requires filesystem
hard-link support (for example NTFS); unsupported destinations report an error.

```powershell
npm run smoke:desktop
npm run smoke:ui
npm run test:desktop-pair
npm run test:features
npm run test:features:relay
npm run build
```

`test:features` uses two independent test profiles and synthetic microphone audio;
it attempts capture only of its own Stillroom test window and fails if sharing
cannot be verified. In an environment without capture access, explicitly run
`npm run test:features:no-sharing`; its result marks sharing as skipped and is not
a screen-sharing pass. `npm run test:rtc` is a 30-second synthetic animated-canvas
benchmark, not a native desktop or cross-PC test. No command records your personal
desktop automatically. Test artifacts are in ignored `.local/` paths.

The Windows output is `dist/Stillroom-win32-x64/Stillroom.exe`; distribute the **whole folder**, including dependency license notices. This is an unsigned development build, not an installer or signed automatic updater. Tests use independent clients over real local WSS, but do not establish separate-computer interoperability or security audit status. See handoff for actually executed results, desktop checks and outstanding gates.

## Collaboration

Read `AGENTS.md`, `HANDOFF.md` and `docs/HANDOFF.md` first. **The implementation is on codex/stillroom-encrypted-dm; main remains the starter.** The owner authorized a checkpoint push; verify the remote branch before relying on availability. A portable Git bundle remains available locally. Feature and main have unrelated roots, so PR comparison may require separately authorized history reconciliation; do not merge automatically. Work on a descriptive `codex/` branch and update both handoff entry points before any subsequently authorized push. Preserve prior work; do not force-push or auto-merge. Never commit reference packages, personal captures, runtime profiles or real secrets.

Hosting, bandwidth and future TURN/storage costs are operator infrastructure costs. They do not create user-facing tiers or artificial quotas. Third-party software retains its upstream licenses; our implementation contains no reference product branding or assets.
