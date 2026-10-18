# Two-PC streaming test build

This development build requests 2560×1440 at 60fps. Local evidence does not prove
that two different PCs and networks can sustain it. The friend is unavailable at
this checkpoint; run this procedure together when both PCs are ready.

## Run

Use branch `codex/stillroom-encrypted-dm`, then `npm ci` and `npm start`, or run
`Stillroom.exe` from the complete `dist/Stillroom-win32-x64` folder. Keep all files
and license notices together. This is an unsigned development build.

The host runs `npm run relay:cloudflare` and keeps that PC awake. If a connector is
already running, read `.local/cloudflare-relay.json` for its current WSS address;
do not start another copy. See [Cloudflare setup](CLOUDFLARE_RELAY.md).

On both PCs, open Connection settings, enter the same current WSS address, choose
**Use system certificate authorities**, and Connect. Preserve existing identities
and history. Exchange public contact cards and compare the entire fingerprints
through a separate authenticated channel before approving one another. Send and
confirm a message in each direction first.

Default connectivity uses Cloudflare's public STUN discovery service. It sees your
IP address. An explicit saved `[]` disables discovery; restore
`[{"urls":"stun:stun.cloudflare.com:3478"}]` in connectivity settings if desired.
STUN helps find a direct route; it cannot bridge every pair of networks. If a
call fails, collect the visible error and network circumstances before choosing
a TURN service. The Cloudflare Quick Tunnel is signalling, not TURN/video hosting.

## Measure each direction

1. Start a voice call and have the other person explicitly accept it. Check voice
   and mute in both directions.
2. Share an explicitly selected 2560×1440 display or window. Use moving content
   for the frame-rate test: a still desktop may legitimately produce fewer frames.
   Never choose confidential content as test material.
3. Allow at least 10 seconds to settle, then keep moving content visible for
   another 65 seconds. Observe the receiver's resolution and sustained statistics.
4. On the receiving PC, use **Save stream report**. It also remains available after
   ending the call. Record PC/GPU, display resolution/refresh, wired or Wi-Fi,
   approximate internet upload speed, and whether system audio was selected in a
   separate note. The generated report omits identities, keys, content, SDP and IPs;
   it does contain measurement timestamps and codec/transport statistics.
5. Stop sharing and verify capture ends. Have the person who accepted the call
   share back, then repeat the measurement and save the other receiver's report.
6. End the call; verify the sharing indicator and OS capture stop. Reconnect and
   repeat a short call to check recovery.

The sustained result requires a full rolling minute at 2560×1440 with measured
average ≥59.9fps (nominal 60Hz tolerance), zero reported dropped frames and zero
reported freezes. Actual values remain visible. Sending or requesting 60fps alone
does not pass. Reports are client observations, not an independent quality or
security audit. A failed target should be retained as evidence.

## Repeatable local probes

Only owned synthetic test windows are captured by these commands. No personal
display or microphone is automatically recorded; microphone data is synthetic.

```powershell
npm run test:features
node scripts/features-pair.mjs --packaged # after npm run build
$env:STILLROOM_RTC_SECONDS = '65'
npm run test:rtc -- --native --require-target
npm run test:rtc -- --native --reverse --require-target
```

The native probes deliberately show a full-screen owned animation at 2560×1440;
they use a 10-second warmup before measuring. The source animation requests 120Hz to keep fresh motion available between the separate source and 60fps capture clocks. A matching display is needed for a
native 1440p result. `--reverse` tests the person who accepted the call as sender.
Run the probes sequentially. Results are under ignored `.local/rtc-*-results.json`.
Exit status 1 with `success:true` and `meets1440p60:false` means the pipeline worked
but the performance target failed. A 30-second default canvas benchmark cannot
pass the full-minute sustained gate.
