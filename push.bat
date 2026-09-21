@echo off
title Push to GitHub - chungam
set "PATH=C:\Users\VICTUS\AppData\Local\Microsoft\WinGet\Packages\Git.MinGit_Microsoft.Winget.Source_8wekyb3d8bbwe\cmd;%PATH%"
echo =======================================================
echo   PUSHING CHUNGAM REPOSITORY TO GITHUB
echo   Remote: https://github.com/richuridhil-max/chungam.git
echo =======================================================
echo.

git push -u origin main

echo.
if %ERRORLEVEL% equ 0 (
    echo [SUCCESS] Successfully pushed to GitHub!
) else (
    echo [NOTICE] If GitHub requested sign-in, please complete it in your browser window.
)
echo.
pause
