# Local dev server — patches config.js with real Airtable credentials, serves on :8080,
# then restores config.js on exit. Credentials live in .env (gitignored).

$envFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "ERROR: .env file not found. Copy .env.example to .env and fill in your credentials." -ForegroundColor Red
    exit 1
}

# Parse .env
$creds = @{}
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#')) {
        $parts = $line -split '=', 2
        if ($parts.Count -eq 2) { $creds[$parts[0].Trim()] = $parts[1].Trim() }
    }
}

$AT_BASE  = $creds['AT_BASE']
$AT_TOKEN = $creds['AT_TOKEN']

if (-not $AT_BASE -or -not $AT_TOKEN) {
    Write-Host "ERROR: AT_BASE or AT_TOKEN missing from .env" -ForegroundColor Red
    exit 1
}

$configPath = Join-Path $PSScriptRoot "js\config.js"
$original   = Get-Content $configPath -Raw -Encoding utf8

# Patch config.js in place
$patched = $original -replace '__AT_BASE__',  $AT_BASE `
                     -replace '__AT_TOKEN__', $AT_TOKEN
$patched | Set-Content $configPath -Encoding utf8 -NoNewline

Write-Host ""
Write-Host "  Local server: http://localhost:8080" -ForegroundColor Cyan
Write-Host "  config.js patched with real credentials"
Write-Host "  Press Ctrl+C to stop (config.js will be restored automatically)"
Write-Host ""

try {
    python -m http.server 8080 --directory $PSScriptRoot
} finally {
    $original | Set-Content $configPath -Encoding utf8 -NoNewline
    Write-Host ""
    Write-Host "  config.js restored to placeholder state." -ForegroundColor Green
}
