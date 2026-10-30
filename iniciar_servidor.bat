@echo off
title Dashboard LuanBeer - Servidor Local
echo ==================================================================
echo   DASHBOARD LUANBEER - GESTION COMERCIAL & DISTRIBUCION
echo ==================================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Iniciando servidor con Node.js en http://127.0.0.1:8080 ...
    start "" "http://127.0.0.1:8080"
    node "%~dp0server.js"
    goto :eof
)

if exist "%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe" (
    echo Iniciando servidor con runtime integrado de Antigravity en http://127.0.0.1:8080 ...
    set ELECTRON_RUN_AS_NODE=1
    start "" "http://127.0.0.1:8080"
    "%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe" "%~dp0server.js"
    goto :eof
)

echo No se detecto un servidor Node.js externo. Abriendo index.html directamente en el navegador...
start "" "%~dp0index.html"
