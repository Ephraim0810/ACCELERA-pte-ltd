@echo off
setlocal
set "APPDIR=C:\Users\ephra\OneDrive\SP\OCBC IGNITE"
if not exist "%APPDIR%\src\server.mjs" set "APPDIR=%~dp0"
cd /d "%APPDIR%"
set "PORT=4174"

rem Reuse CasePilot if it is already responding.
powershell.exe -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:4174/api/health' -TimeoutSec 1; if ($r.name -eq 'CasePilot' -and $r.workflowVersion -eq 3) { exit 0 } } catch { exit 1 }; exit 1" >nul 2>&1
if not errorlevel 1 goto open_page

echo Starting the CasePilot demo...
start "CasePilot Server" /min node src\server.mjs

set "TRIES=0"
:wait_for_server
powershell.exe -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:4174/api/health' -TimeoutSec 1; if ($r.name -eq 'CasePilot') { exit 0 } } catch { exit 1 }; exit 1" >nul 2>&1
if not errorlevel 1 goto open_page
set /a TRIES+=1
if %TRIES% GEQ 15 goto failed
timeout /t 1 /nobreak >nul
goto wait_for_server

:open_page
start "" "http://127.0.0.1:4174/"
echo CasePilot is open. You can close this window.
exit /b 0

:failed
echo CasePilot did not start. Check that Node.js 22.5 or newer is installed and that port 4174 is free.
pause
exit /b 1


