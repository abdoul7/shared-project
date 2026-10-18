# Stillroom

An original Windows-first private desktop communication project. **Experimental slice A: encrypted direct text messages.** Voice, screen sharing, file transfers and private groups are not implemented yet. No payment gates or subscriptions. See [project plan](docs/PROJECT_PLAN.md), [security design](docs/SECURITY.md) and [continuation handoff](docs/HANDOFF.md).

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

```powershell
npm run smoke:desktop
npm run build
```

The Windows output is `dist/Stillroom-win32-x64/Stillroom.exe`; distribute the **whole folder**, including dependency license notices. This is an unsigned development build, not an installer or signed automatic updater. Tests use independent clients over real local WSS, but do not establish separate-computer interoperability or security audit status. See handoff for actually executed results, desktop checks and outstanding gates.

## Collaboration

Read `AGENTS.md`, `HANDOFF.md` and `docs/HANDOFF.md` first. Work on a descriptive `codex/` branch, update both handoff entry points before every push, and create a draft PR. Preserve prior work; do not force-push or auto-merge. Never commit reference packages, personal captures, runtime profiles or real secrets.

Hosting, bandwidth and future TURN/storage costs are operator infrastructure costs. They do not create user-facing tiers or artificial quotas. Third-party software retains its upstream licenses; our implementation contains no reference product branding or assets.
