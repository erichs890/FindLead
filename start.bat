@echo off
setlocal
cd /d "%~dp0"
title CacaLead

rem Um clique sobe tudo: o servidor (4790), que guarda e busca os dados, e a tela (5173).
rem O servidor vai por `npm run servidor`, sem --watch: salvar um arquivo do projeto nao derruba nada.

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao encontrado. Instale a versao 24 ou mais nova em https://nodejs.org e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias ^(so na primeira vez^)...
  call npm install
  if errorlevel 1 (
    echo.
    echo Falha ao instalar as dependencias.
    pause
    exit /b 1
  )
)

echo.
echo   Subindo o servidor do CacaLead em uma segunda janela...
start "CacaLead - servidor" cmd /k "npm run servidor"

echo.
echo   CacaLead
echo   --------------------------------------------------------------
echo   Tela:      http://localhost:5173
echo   Servidor:  http://localhost:4790
echo.
echo   Sem base da Receita ainda? Rode atualizar-base.bat uma vez.
echo   Feche as duas janelas para parar.
echo   --------------------------------------------------------------
echo.

call npm run dev -- --open

pause
