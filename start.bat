@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js ^>= 20 first.
  pause
  exit /b 1
)

rem --- Check omp ---
where omp >nul 2>nul
if errorlevel 1 (
  echo [ERROR] omp not found. omp is required as the AI engine.
  echo.
  echo   Windows ^(PowerShell^):  irm https://omp.sh/install.ps1 ^| iex
  echo   macOS / Linux:            curl -fsSL https://omp.sh/install ^| sh
  echo   Homebrew:                 brew install can1357/tap/omp
  echo   Bun:                      bun install -g @oh-my-pi/pi-coding-agent
  echo.
  echo   After install, run this script again.
  pause
  exit /b 1
)

rem --- Clean up old server on port 3838 ---
netstat -ano | findstr ":3838" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo [CLEANUP] Port 3838 is in use. Closing old omp-web server...
  for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3838" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%p >nul 2>nul
  )
  timeout /t 1 /nobreak >nul
)

if not exist node_modules (
  echo [SETUP] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo [BUILD] Building frontend...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build failed.
  pause
  exit /b 1
)

start "" http://127.0.0.1:3838
node server.mjs
pause
