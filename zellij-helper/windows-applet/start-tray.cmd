@echo off
rem Launches the tray applet fully detached -- survives whatever terminal,
rem editor, or agent session invoked it. Double-click friendly.
rem (The \. suffix avoids %~dp0's trailing backslash escaping the quotes.)
start "" /D "%~dp0." "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
