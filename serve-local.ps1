# Local dev server — loads credentials from .env and starts serve.py

$envFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "ERROR: .env not found. Copy .env.example to .env and fill in credentials." -ForegroundColor Red
    exit 1
}

$creds = @{}
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#')) {
        $parts = $line -split '=', 2
        if ($parts.Count -eq 2) { $creds[$parts[0].Trim()] = $parts[1].Trim() }
    }
}

if (-not $creds['AT_BASE'] -or -not $creds['AT_TOKEN']) {
    Write-Host "ERROR: AT_BASE or AT_TOKEN missing from .env" -ForegroundColor Red
    exit 1
}

$env:AT_BASE  = $creds['AT_BASE']
$env:AT_TOKEN = $creds['AT_TOKEN']

Set-Location $PSScriptRoot
python serve.py
