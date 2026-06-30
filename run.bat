@echo off
title OfficeHub Server
echo Starting OfficeHub Server...
echo.

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in system PATH.
    echo Please install Python 3.8+ from https://www.python.org/
    pause
    exit /b 1
)

:: Create virtual environment if it doesn't exist
if not exist venv (
    echo Creating virtual environment (venv)...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

:: Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate
if %errorlevel% neq 0 (
    echo [ERROR] Failed to activate virtual environment.
    pause
    exit /b 1
)

:: Install dependencies
echo Installing dependencies from requirements.txt...
python -m pip install --upgrade pip >nul 2>&1
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

cls
echo ====================================================================
echo                   OFFICEHUB HOSTING OPTIONS
echo ====================================================================
echo.
echo  Choose how you want to run the OfficeHub portal:
echo.
echo  [1] LOCAL NETWORK ONLY (Intranet)
echo      - Best for office-only use.
echo      - Data stays strictly within your local network.
echo      - Fast, private, and secure.
echo.
echo  [2] PUBLIC INTERNET (Anywhere Access)
echo      - Exposes the portal to the internet using a secure HTTPS tunnel.
echo      - Allows access from home, mobile devices, or remote workers.
echo      - Provides a shareable public link (e.g., https://xxxx.lhr.life).
echo.
echo ====================================================================
echo.
set /p MODE="Select mode (1 or 2): "

if "%MODE%"=="2" (
    cls
    echo Starting local Flask server in background...
    :: Start Flask in a minimized command window named "OfficeHub Backend"
    start "OfficeHub Backend" /min cmd /c "call venv\Scripts\activate && python app.py"
    
    echo.
    echo Exposing server to the public internet using localhost.run...
    echo.
    echo =======================================================================
    echo   YOUR PUBLIC URL will appear below (look for the line with "https://").
    echo   Copy and share that link with anyone you want to connect.
    echo   Press Ctrl+C or close this window to stop the server and tunnel.
    echo =======================================================================
    echo.
    
    :: Start SSH tunnel (StrictHostKeyChecking=no bypasses the interactive fingerprint prompt)
    ssh -o StrictHostKeyChecking=no -R 80:127.0.0.1:5000 nokey@localhost.run
    
    :: Clean up the backend Flask server when the SSH tunnel is closed
    echo.
    echo Shutting down local server...
    taskkill /fi "windowtitle eq OfficeHub Backend" >nul 2>&1
) else (
    :: Find primary local IPv4 address using PowerShell
    for /f "usebackq tokens=*" %%a in (`powershell -Command "try { Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex (Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Select-Object -First 1).InterfaceIndex | Select-Object -ExpandProperty IPAddress -First 1 } catch { '127.0.0.1' }"`) do set LOCAL_IP=%%a

    if "%LOCAL_IP%"=="" (
        set LOCAL_IP=127.0.0.1
    )

    cls
    echo ====================================================================
    echo                   OFFICEHUB CHAT & FILE SYSTEM
    echo ====================================================================
    echo.
    echo  The server is starting up. To access it from any computer in the
    echo  office local network, open a web browser and go to:
    echo.
    echo      http://%LOCAL_IP%:5000
    echo.
    echo  (Or on this server computer directly: http://localhost:5000)
    echo.
    echo ====================================================================
    echo.
    echo Server Logs:
    python app.py
)
pause
