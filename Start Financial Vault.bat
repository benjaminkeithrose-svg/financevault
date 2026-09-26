@echo off
rem Double-click this file to start Financial Vault. The first time, it
rem installs what it needs (a few minutes) and puts a Financial Vault icon
rem on the desktop - use that icon from then on. It opens in its own
rem window; closing that window stops Financial Vault.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js isn't installed yet.
  echo 1. Go to https://nodejs.org
  echo 2. Download and install the LTS version
  echo 3. Double-click this file again
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo First run - installing everything ^(this can take a few minutes^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Installing failed - see the messages above.
    pause
    exit /b 1
  )
)

rem On one line, so an update can safely replace this file while Financial Vault runs.
node launcher\launch.mjs & exit /b
