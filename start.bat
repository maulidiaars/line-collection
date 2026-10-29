@echo off
chcp 65001 >nul
title Line Collection
cd /d "%~dp0"
echo.
echo  ===== LINE COLLECTION =====
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] O Node.js nao esta instalado.
  echo        Baixe a versao LTS em https://nodejs.org  e rode este arquivo de novo.
  pause & exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=5)?0:1)"
if errorlevel 1 (
  echo [ERRO] Seu Node.js e antigo demais. E preciso a versao 22.5 ou mais nova.
  echo        Baixe a versao LTS em https://nodejs.org
  pause & exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias ^(so na primeira vez, pode levar 1 minuto^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo [ERRO] Falha no npm install. Verifique sua internet. & pause & exit /b 1 )
)

if not exist .env (
  echo Criando arquivo .env com uma chave secreta nova...
  copy /y .env.example .env >nul
  node -e "const fs=require('fs');const k=require('crypto').randomBytes(48).toString('hex');fs.writeFileSync('.env',fs.readFileSync('.env','utf8').replace('SESSION_SECRET=','SESSION_SECRET='+k))"
)

call npm run seed --silent
if errorlevel 1 ( echo [ERRO] Falha ao preparar o banco de dados. & pause & exit /b 1 )

node --disable-warning=ExperimentalWarning scripts/tem-admin.js
if errorlevel 1 (
  echo.
  echo Ainda nao existe um administrador. Vamos criar agora:
  call npm run criar-admin
)

echo.
echo Abrindo o site em http://localhost:3000  ^(feche esta janela para desligar^)
start "" http://localhost:3000
call npm start
echo.
echo O servidor parou. Veja a mensagem acima.
pause
