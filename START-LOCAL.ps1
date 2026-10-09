param([switch]$Stop)
$ErrorActionPreference = 'Stop'
$retreatRoot = $PSScriptRoot
Set-Location -LiteralPath $retreatRoot
$retreatNode = Get-Command node -ErrorAction SilentlyContinue
if ($retreatNode) { $retreatNodePath = $retreatNode.Source }
else {
    $retreatNodePath = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
    if (-not (Test-Path -LiteralPath $retreatNodePath)) { throw 'Install Node.js 22.13 or newer, then run START-LOCAL.ps1 again.' }
}
$env:PATH = (Split-Path -Parent $retreatNodePath) + ';' + $env:PATH
if (-not $Stop -and -not (Test-Path -LiteralPath 'node_modules/next/package.json')) { throw 'Install the dependencies with npm ci --include=dev --include=optional before starting.' }
if ($Stop) { & $retreatNodePath 'scripts/stop-local.mjs' }
else { & $retreatNodePath 'scripts/dev-local.mjs' }
if ($LASTEXITCODE -ne 0) { throw 'Local task failed. See the message above.' }
