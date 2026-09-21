@echo off
title Lumiere 3D Experience Server
echo Starting Lumiere 3D Haute Joaillerie Local Server...
powershell -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Port 3000
pause
