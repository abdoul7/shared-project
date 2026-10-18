# Free test relay without a VPN

Prepared configuration, not a deployment receipt. No service has been created and
no account, payment method, repository connection, or public endpoint was changed.
The developers chose not to use Tailscale; neither client needs a VPN for this route.

## Render deployment

1. Sign into [Render](https://dashboard.render.com/) with your own account and
   authorize access only to the shared repository when connecting GitHub.
2. Create a Blueprint from `abdoul7/shared-project`, branch
   `codex/stillroom-encrypted-dm`, using the checked-in `render.yaml`.
   Review that it creates one **Free** Node web service, no database or disk.
   Automatic deploys are disabled. Do not approve a paid plan or add payment details
   merely to follow these instructions; stop if the dashboard requires a purchase.
3. Deploy the chosen checkpoint. The build installs production dependencies only;
   the server does not install or run Electron. The hosted entry point uses Render's
   `PORT` and `RENDER_EXTERNAL_URL` environment variables.
4. Wait for the service to become healthy. Copy its actual HTTPS URL, for example
   `https://YOUR-SERVICE.onrender.com/`. Do not treat the example as an existing host.
5. Both desktop clients use `wss://YOUR-SERVICE.onrender.com/` in Connection settings.
   Use normal system certificate trust, never the shared localhost test certificate
   or disabled TLS verification. Exchange public contact cards over an authenticated
   channel, compare full fingerprints, and approve each other.

If an existing test profile has a private CA selected, use a separate named profile
for the hosted trial instead of deleting its history:

```powershell
$env:STILLROOM_PROFILE = 'hosted-trial'
npm start
```

The existing UI does not yet clear a custom CA. Never share private profile files.
For another TLS-terminating host, set `RELAY_PUBLIC_URL` to the exact public WSS
origin and `PORT` to its internal listener port before running `server/hosted-relay.js`.

## Security boundary

The desktop-to-provider connection is certificate-validated WSS. The provider
terminates TLS and forwards to the HTTP listener inside its hosting environment.
This internal listener must never be published directly as plaintext WebSocket.
The standard `server/relay.js` entry point still requires its own TLS key/certificate;
hosted mode is an explicit separate entry point, not a certificate-error fallback.

Peer content and control envelopes remain end-to-end encrypted/authenticated before
they reach either ingress or relay. The provider can observe routing metadata and
ciphertext and can disrupt traffic. Existing static-key messaging lacks forward
secrecy; hosting does not fix that. Never describe this checkpoint as audited.

## Cost and availability limits

Render's [Free service documentation](https://render.com/docs/free) describes idle
sleep, cold starts, shared monthly compute hours and metered bandwidth/build usage.
Review the dashboard's current terms before deployment. Without a payment method,
exhausted allowances can suspend the service; do not promise unlimited free hosting.
Do not add artificial account or file-size limits to Stillroom in response.

Both desktops must currently be online: pending content stays in the sender's
encrypted outbox; the relay does not persist messages. Start/restart can disconnect
peers. The app retries connections, but free-tier cold starts may require patience.
For a sleeping service, open its HTTPS URL to wake it, then reconnect both clients.

## Required two-PC verification

- Confirm both clients authenticate to the same WSS origin with normal TLS trust.
- Send messages both ways; verify peer-confirmed delivery, restart, and reconnect.
- Accept a voice call; test real microphones and mute/hangup.
- Explicitly select a screen/window and verify received frames and system audio.
- Transfer a synthetic file, compare SHA-256, and test interruption/resume.
- Record actual machines/network conditions, receiver resolution/FPS and duration.

The hosted relay handles messaging/signalling and encrypted file fallback. It is
not a TURN server or a video host. Direct WebRTC may still fail across restrictive
networks; a separate operator-provided STUN/TURN setup may be needed. Do not claim
that deploying this relay guarantees media connectivity or 1440p60. Large file
fallback consumes provider bandwidth; direct transfer is preferred when available.

Sources: [Web services](https://render.com/docs/web-services),
[WebSockets](https://render.com/docs/websocket),
[Free instances](https://render.com/docs/free).
