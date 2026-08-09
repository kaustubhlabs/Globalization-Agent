param(
  [string]$Path = ".\package.json"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Path)) {
  throw "File not found: $Path"
}

[byte[]]$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $Path))

if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
  $bytes = $bytes[3..($bytes.Length - 1)]
  Write-Host "Removed UTF-8 BOM."
}

$text = [System.Text.Encoding]::UTF8.GetString($bytes)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Resolve-Path $Path), $text, $utf8NoBom)

try {
  $null = (Get-Content $Path -Raw) | ConvertFrom-Json
  Write-Host "package.json is valid JSON and saved without BOM."
} catch {
  Write-Error "JSON validation failed: $($_.Exception.Message)"
  exit 1
}
