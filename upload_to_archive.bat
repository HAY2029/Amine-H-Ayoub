@echo off
title Archive_Audio_Uploader
color 0B

echo ===================================================
echo     Archive.org Audio Uploader Script (Auto-Retry)
echo ===================================================
echo.

:INSTALL_LOOP
echo [1] Checking Internet Archive CLI (ia)...
pip show internetarchive >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing internetarchive via pip...
    pip install internetarchive --default-timeout=100
    if %errorlevel% neq 0 (
        echo [ERROR] Network timeout during install. Retrying in 5 seconds...
        timeout /t 5 >nul
        goto INSTALL_LOOP
    )
) else (
    echo internetarchive is already installed.
)

echo.
echo [2] Configuring S3 Keys...
if not exist "%USERPROFILE%\.config" mkdir "%USERPROFILE%\.config"
echo [s3] > "%USERPROFILE%\.config\ia.ini"
echo access = IOXvS7o9iK5u9oWP >> "%USERPROFILE%\.config\ia.ini"
echo secret = S2pXXRfg4iypxSKH >> "%USERPROFILE%\.config\ia.ini"
echo Configuration successful!

echo.
:UPLOAD_START
echo.
echo ===================================================
echo [3] Starting Robust Upload...
echo NOTE: You can close this window at any time.
echo ===================================================
echo.

python "%~dp0robust_upload.py"

:DONE
echo.
echo ===================================================
echo SUCCESS: Upload Process Finished!
echo ===================================================
pause
