# Temporary Cloudflare relay

The user chose Cloudflare after Render required a payment card. This route uses a
Quick Tunnel: no Cloudflare account, domain, VPN, inbound port forwarding or card
is needed. It is a development connection with a changing hostname, not an
always-on server. The host PC must remain awake and online.

## Host

Install cloudflared from the [official downloads](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/).
For this Windows checkout, the verified official 2026.10.1 x64 binary was downloaded
to ignored `.local/tools/cloudflared.exe`. SHA-256 from the official GitHub release:
`4d2490e74082c5d48dbfedaf92576fa5bd1702379ab88eb7faa0cfbe8dc891b6`.
That executable is not committed. A teammate hosting their own tunnel must obtain
their own official connector; optionally set `CLOUDFLARED_PATH` to its absolute path.

From the repository with dependencies installed:

```powershell
npm run relay:cloudflare
```

The supervisor starts cloudflared and binds the relay to a free **127.0.0.1-only**
port. It prints the exact public WSS URL and saves runtime state to ignored
`.local/cloudflare-relay.json`. Connector diagnostics stay in `.local/cloudflared.log`.
Ctrl+C in that terminal stops both owned processes. Do not terminate all Node
processes or remove unrelated services. If started in the background, use the exact
recorded supervisor/connector PIDs after verifying their command lines.

The existing localhost TLS test relay is independent. This launcher does not expose
its shared test certificate, existing LAN services, files, or development servers.

## Both desktops

Use the **same current WSS URL** in Connection settings. Keep normal certificate
verification. Existing profiles with a private localhost CA can use a fresh profile
for this public-certificate trial; do not delete old identities/history:

```powershell
$env:STILLROOM_PROFILE = 'cloudflare-trial'
npm start
```

Exchange only public contact cards through an authenticated channel, compare full
fingerprints, and approve each other. Then test messages both ways. The friend
does not need cloudflared or a VPN; only the host runs the connector.

Anyone knowing the URL can reach the service, but Stillroom still requires signed
identity authentication and reciprocal verified-contact approval for delivery.
Cloudflare terminates public TLS, forwards over its encrypted tunnel, then uses
loopback HTTP to the local relay. Peer content/control envelopes remain E2EE; routing
metadata and availability are not hidden from the provider. No plaintext fallback,
disabled TLS checks, or localhost test keys are involved. Existing static-key
forward-secrecy limitations still apply.

## Limits

The address changes on restart and stops when the connector or host stops. Quick
Tunnels have no uptime guarantee and are for development. Do not enable interactive
email authentication: the desktop's non-browser WebSocket client cannot complete it.
See [official Quick Tunnel behavior and limits](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

This is a messaging/signalling relay with encrypted file fallback, not a TURN/video
server. Separate direct WebRTC connectivity or a configured TURN server is still
needed for calls. A tunnel alone does not establish 1440p60 or unlimited provider
bandwidth. Prefer direct file transport when available. Do not bulk-benchmark the
public tunnel without checking the provider's applicable usage terms.
