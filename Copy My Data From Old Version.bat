@echo off
setlocal
rem Updating Financial Vault: run this from the NEW copy's folder. It copies
rem your records, documents and settings from the OLD copy into this one.
rem The old copy is only read from, never changed or deleted.
cd /d "%~dp0"

echo Copy your data into this new copy of Financial Vault
echo ----------------------------------------------------
echo Before you start, close Financial Vault if it's running.
echo.
set "OLD="
set /p "OLD=Drag the OLD Financial Vault folder into this window, then press Enter: "
set "OLD=%OLD:"=%"
if "%OLD:~-1%"=="\" set "OLD=%OLD:~0,-1%"
if not exist "%OLD%\server\prisma\dev.db" if exist "%OLD%\financevault\server\prisma\dev.db" set "OLD=%OLD%\financevault"

if not exist "%OLD%\server\prisma\dev.db" (
  echo.
  echo No Financial Vault records were found in:
  echo   %OLD%
  echo Nothing was copied. Check you dragged in the OLD folder ^(the one with the
  echo "Start Financial Vault" file in it^) and try again.
  pause
  exit /b 1
)

if /I "%OLD%"=="%CD%" (
  echo.
  echo That's this same folder. Drag in the OLD copy instead. Nothing was copied.
  pause
  exit /b 1
)

if not exist "server\prisma" mkdir "server\prisma"
for /f "tokens=1-3 delims=/:. " %%a in ("%TIME%") do set "STAMP=%%a%%b%%c"
rem If this copy was already started, keep its (empty) records aside rather than deleting them.
if exist "server\prisma\dev.db" (
  ren "server\prisma\dev.db" "dev.db.before-copy-%STAMP%"
  if exist "server\prisma\dev.db-journal" del "server\prisma\dev.db-journal"
)

echo.
echo Copying your records...
copy /Y "%OLD%\server\prisma\dev.db*" "server\prisma\" >nul
if errorlevel 1 (
  echo Copying failed - nothing else was changed.
  pause
  exit /b 1
)

if exist "%OLD%\server\storage" (
  echo Copying your documents ^(this can take a while if there are many^)...
  xcopy "%OLD%\server\storage" "server\storage\" /E /I /Y /Q >nul
)

if exist "%OLD%\server\.env" copy /Y "%OLD%\server\.env" "server\.env" >nul

echo.
echo Done. Your records and documents are in this copy now.
echo Next: double-click "Start Financial Vault" in this folder and unlock with your usual passcode.
echo Keep the old folder until you've checked everything is there.
pause
