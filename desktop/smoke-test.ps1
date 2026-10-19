# Starts the installed Financial Vault in its check mode (FV_SMOKE_TEST) and
# fails unless it answered, showed its first screen, opened the records and
# read a scanned document. Used by .github/workflows/windows-installer.yml.
param(
  [string]$Name,
  [string]$Passcode = "",
  [switch]$ExpectBackup
)
$ErrorActionPreference = "Stop"
$data = "$env:RUNNER_TEMP\fv-data"
$result = "$env:RUNNER_TEMP\smoke-$Name.json"
Remove-Item $result -ErrorAction SilentlyContinue

$env:FV_SMOKE_TEST = "1"
$env:FV_SMOKE_RESULT = $result
$env:FV_SMOKE_PASSCODE = $Passcode
$env:FV_DATA_DIR = $data
$env:FV_PORT = "4150"

$p = Start-Process -FilePath $env:FV_EXE -PassThru
if (-not $p.WaitForExit(300000)) { $p.Kill(); throw "The $Name check didn't finish within 5 minutes" }

Write-Host "---- launcher.log"
Get-Content "$data\Logs\launcher.log" -ErrorAction SilentlyContinue | Select-Object -Last 40
Write-Host "---- server.log"
Get-Content "$data\Logs\server.log" -ErrorAction SilentlyContinue | Select-Object -Last 20
if (-not (Test-Path $result)) { throw "The $Name check wrote no result" }
Write-Host "---- result"
Get-Content $result
$r = Get-Content $result -Raw | ConvertFrom-Json
if (-not $r.ok) { throw "The $Name check failed" }
if ($ExpectBackup) {
  if (-not ($r.steps.backups | Where-Object { $_ -like "financevault-before-installing-*" })) { throw "No backup was made before the upgrade" }
  if ($r.steps.info.lastUpdate.kind -ne "UPDATED") { throw "What's new wasn't recorded" }
}
Write-Host "The $Name check passed."
