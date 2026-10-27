@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.5 or newer is needed. Install Node.js, then open this file again.
  pause
  exit /b 1
)
node -e "const [m,n]=process.versions.node.split('.').map(Number);if(m<22||(m===22&&n<5))process.exit(1)"
if errorlevel 1 (
  echo Please use Node.js 22.5 or newer.
  pause
  exit /b 1
)
if not exist "node_modules\@libsql\client\package.json" (
  echo Preparing Accelera dependencies...
  call npm ci --no-audit --no-fund
  if errorlevel 1 (
    echo Dependency installation failed. Check the connection and try again.
    pause
    exit /b 1
  )
)
node scripts/start-local.mjs
if errorlevel 1 pause
endlocal
