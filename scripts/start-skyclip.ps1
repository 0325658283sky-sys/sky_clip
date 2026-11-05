$ErrorActionPreference = 'Stop'
$port = 8787
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  Write-Host "SkyClip is already running at http://127.0.0.1:$port"
  exit 0
}
Write-Host "Starting SkyClip at http://127.0.0.1:$port"
node server.mjs
