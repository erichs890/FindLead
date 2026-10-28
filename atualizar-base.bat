@echo off
setlocal
cd /d "%~dp0"
title CacaLead - atualizar base da Receita

rem Baixa o mes mais recente da Receita e troca a base no fim. Se cair no meio, a base anterior continua valendo
rem e rodar de novo retoma o download de onde parou. Os seus leads (crm.db) nunca sao tocados.
rem
rem Para mudar os filtros, edite a linha FILTROS abaixo. Opcoes: npm run ingestao -- --ajuda
set FILTROS=--ufs=SP --desde=2024-01-01

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
echo   CacaLead - atualizando a base da Receita
echo   --------------------------------------------------------------
echo   Filtros: %FILTROS%
echo   Download de ~7 GB; leva de 30 a 60 minutos. Pode minimizar.
echo   --------------------------------------------------------------
echo.

call npm run ingestao -- %FILTROS%

echo.
pause
