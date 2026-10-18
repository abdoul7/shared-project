$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectDirectory
# Shared fixture key is ONLY for local testing. Do not expose this relay remotely.
$env:RELAY_HOST = '127.0.0.1'
$env:RELAY_PORT = '8443'
$env:RELAY_PUBLIC_URL = 'wss://localhost:8443/'
$env:RELAY_TLS_CERT = Join-Path $projectDirectory 'test/fixtures/localhost-cert.pem'
$env:RELAY_TLS_KEY = Join-Path $projectDirectory 'test/fixtures/localhost-key.pem'
node server/relay.js
