@echo off
setlocal
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
echo Starting server on http://localhost:3080
node server.js
