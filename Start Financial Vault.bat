@echo off
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
  call npm install
  if errorlevel 1 (
    echo Something went wrong during install - see the messages above.
    pause
    exit /b 1
  )
)

if not exist "server\.env" (
  copy "server\.env.example" "server\.env" >nul
)

echo Setting up the database...
pushd server
call npx prisma generate
call npx prisma migrate deploy
call npm run prisma:seed
popd

echo Building the app...
call npm run build
if errorlevel 1 (
  echo Build failed - see the messages above.
  pause
  exit /b 1
)

echo Starting Financial Vault in a new window...
start "Financial Vault" cmd /k "node server\dist\index.js"
timeout /t 3 /nobreak >nul
start "" "http://localhost:4000"

echo Financial Vault is running in the other window titled "Financial Vault".
echo Close that window to stop the app. You can close this one now.
pause
