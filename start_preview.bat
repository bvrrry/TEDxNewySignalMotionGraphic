@echo off
rem Starts the local web server the scene needs and opens the live scrub preview in your browser.
rem (The page must be served over http because the scene uses ES modules.) Close the server window to stop it.
cd /d "%~dp0"
start "Signal preview server" /min python -m http.server 8123
timeout /t 2 /nobreak >nul
start "" "http://localhost:8123/preview.html"
