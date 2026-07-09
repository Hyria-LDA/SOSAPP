param(
  [string]$Mensagem = "faxina tecnica e ajustes do app",
  [switch]$SemBuild
)

$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $PSScriptRoot

Write-Host ""
Write-Host "== SOS Marceneiros: publicar atualizacoes ==" -ForegroundColor Cyan
Write-Host "Pasta: $PSScriptRoot"
Write-Host ""

if (-not (Test-Path ".git")) {
  Write-Host "Erro: esta pasta nao parece ser um repositorio Git." -ForegroundColor Red
  exit 1
}

$remote = git remote get-url origin 2>$null
if (-not $remote) {
  Write-Host "Erro: nao encontrei o remote 'origin' do GitHub." -ForegroundColor Red
  exit 1
}

Write-Host "GitHub: $remote" -ForegroundColor DarkGray
Write-Host ""

$changes = git status --short
if (-not $changes) {
  Write-Host "Nao ha alteracoes para subir." -ForegroundColor Yellow
  exit 0
}

Write-Host "Alteracoes encontradas:" -ForegroundColor Yellow
git status --short
Write-Host ""

if (-not $SemBuild) {
  Write-Host "Rodando build antes de subir..." -ForegroundColor Cyan
  npm.cmd run build
  Write-Host ""
}

Write-Host "Mensagem do commit:" -ForegroundColor Cyan
Write-Host "  $Mensagem"
Write-Host ""

$confirmacao = Read-Host "Digite S para commitar e enviar para o GitHub"
if ($confirmacao -ne "S" -and $confirmacao -ne "s") {
  Write-Host "Cancelado. Nada foi enviado." -ForegroundColor Yellow
  exit 0
}

git add -A

$staged = git diff --cached --name-only
if (-not $staged) {
  Write-Host "Nada ficou preparado para commit." -ForegroundColor Yellow
  exit 0
}

git commit -m $Mensagem
git push

Write-Host ""
Write-Host "Pronto: alteracoes enviadas para o GitHub." -ForegroundColor Green
Write-Host "Agora o Vercel deve iniciar o deploy automaticamente." -ForegroundColor Green
