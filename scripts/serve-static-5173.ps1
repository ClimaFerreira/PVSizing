$ErrorActionPreference = "Stop"

Set-Location -LiteralPath "$PSScriptRoot\..\artifacts\pv-sizing\dist\public"

& "C:\Users\marci\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m http.server 5173 --bind 127.0.0.1
