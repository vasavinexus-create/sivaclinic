# Builds and runs the Siva Clinic Electron desktop app.
# Usage:
#   .\build-run-electron.ps1          # build Next.js and create an unpacked Windows desktop app
#   .\build-run-electron.ps1 -Run     # run the Electron app in development mode
#   .\build-run-electron.ps1 -Build   # create Windows installer and portable EXE

param(
  [switch]$Run,
  [switch]$Build
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @()
  )
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE`: $FilePath $($Arguments -join ' ')"
  }
}

$root = (Resolve-Path -LiteralPath $PSScriptRoot).Path
Set-Location -LiteralPath $root

$env:electron_config_cache = Join-Path $root ".electron-cache"
$env:ELECTRON_BUILDER_CACHE = Join-Path $root ".electron-builder-cache"

Write-Host "Starting Siva Clinic Electron desktop build..."

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing npm dependencies..."
  Invoke-Checked "npm.cmd" @("install", "--strict-ssl=false")
}

if (-not (Test-Path "node_modules\electron")) {
  Write-Host "Installing Electron dependencies..."
  Invoke-Checked "npm.cmd" @("install", "--save-dev", "electron", "electron-builder", "--strict-ssl=false")
}

try {
  Invoke-Checked "npx.cmd" @("electron", "--version")
} catch {
  Write-Host "Electron runtime is not ready. Downloading Electron runtime with local cache..." -ForegroundColor Yellow
  $env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
  Invoke-Checked "npx.cmd" @("install-electron", "--no")
}

if ($Run) {
  Write-Host "Running Electron desktop app..."
  Invoke-Checked "npm.cmd" @("run", "electron:dev")
  return
}

if ($Build) {
  Write-Host "Building Windows installer and portable EXE..."
  $env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
  Invoke-Checked "npm.cmd" @("run", "electron:build")
  Write-Host "Electron build output: dist-electron" -ForegroundColor Green
  return
}

Write-Host "Building unpacked Windows desktop app..."
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
Invoke-Checked "npm.cmd" @("run", "electron:pack")

$exe = "dist-electron\win-unpacked\Siva Clinic.exe"
if (Test-Path $exe) {
  Write-Host "Electron app ready: $exe" -ForegroundColor Green
} else {
  Write-Host "Electron packaging finished, but expected EXE was not found at $exe" -ForegroundColor Yellow
  Write-Host "Check dist-electron for the generated output."
}
