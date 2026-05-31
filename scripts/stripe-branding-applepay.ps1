param(
  [string]$Domain = "habtrack.andrrluis86.workers.dev",
  [string]$LogoPath = "images/habtrack-logo-header.png",
  [string]$IconPath = "images/habtrack-icon.png"
)

$ErrorActionPreference = "Stop"

function Read-SecretValue($Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Invoke-StripeForm($Path, $Body) {
  $headers = @{ Authorization = "Bearer $script:StripeSecret" }
  return Invoke-RestMethod -Method Post -Uri "https://api.stripe.com/v1$Path" -Headers $headers -Body $Body -ContentType "application/x-www-form-urlencoded"
}

function Invoke-StripeGet($Path) {
  $headers = @{ Authorization = "Bearer $script:StripeSecret" }
  return Invoke-RestMethod -Method Get -Uri "https://api.stripe.com/v1$Path" -Headers $headers
}

function Upload-StripeFile($Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Arquivo nao encontrado: $Path"
  }

  $fullPath = (Resolve-Path -LiteralPath $Path).Path
  $curl = Get-Command curl.exe -ErrorAction Stop
  $output = & $curl.Source -sS https://files.stripe.com/v1/files `
    -u "${script:StripeSecret}:" `
    -F purpose=business_logo `
    -F "file=@$fullPath"

  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao fazer upload do arquivo para Stripe."
  }

  $json = $output | ConvertFrom-Json
  if (-not $json.id) {
    throw "Stripe nao retornou file id: $output"
  }
  return $json
}

Write-Host "HabTrack Stripe Branding + Apple Pay Setup" -ForegroundColor Cyan
Write-Host "Cole sua chave secreta LIVE da Stripe (sk_live_...). Ela nao sera salva nem exibida." -ForegroundColor Yellow
$script:StripeSecret = Read-SecretValue "Stripe secret key"

if (-not $script:StripeSecret.StartsWith("sk_live_")) {
  Write-Host "Aviso: esta chave nao parece live. Para checkout real use sk_live_." -ForegroundColor Yellow
}

Write-Host "`nValidando conta..." -ForegroundColor Cyan
$account = Invoke-StripeGet "/account"
Write-Host "Conta: $($account.id) | Nome publico atual: $($account.settings.dashboard.display_name)" -ForegroundColor Green

Write-Host "`nEnviando logo..." -ForegroundColor Cyan
$logo = Upload-StripeFile $LogoPath
Write-Host "Logo file id: $($logo.id)" -ForegroundColor Green

Write-Host "Enviando icone..." -ForegroundColor Cyan
$icon = Upload-StripeFile $IconPath
Write-Host "Icon file id: $($icon.id)" -ForegroundColor Green

Write-Host "`nTentando aplicar branding no Checkout..." -ForegroundColor Cyan
try {
  $updated = Invoke-StripeForm "/account" @{
    "settings[branding][logo]" = $logo.id
    "settings[branding][icon]" = $icon.id
    "settings[branding][primary_color]" = "#00A3FF"
    "settings[branding][secondary_color]" = "#0D0D10"
  }
  Write-Host "Branding aplicado. Logo: $($updated.settings.branding.logo) | Icon: $($updated.settings.branding.icon)" -ForegroundColor Green
} catch {
  Write-Host "A Stripe bloqueou aplicar branding via API na propria conta." -ForegroundColor Yellow
  Write-Host "Os arquivos foram enviados com sucesso. Use estes ids no Dashboard se aparecerem na biblioteca:" -ForegroundColor Yellow
  Write-Host "Logo: $($logo.id)" -ForegroundColor Green
  Write-Host "Icon: $($icon.id)" -ForegroundColor Green
  Write-Host "Continuei para cadastrar o dominio do Apple Pay." -ForegroundColor Yellow
}

Write-Host "`nVerificando Payment Method Domain para Apple Pay / wallets..." -ForegroundColor Cyan
$domains = Invoke-StripeGet "/payment_method_domains?limit=100"
$existing = $domains.data | Where-Object { $_.domain_name -eq $Domain } | Select-Object -First 1
if ($existing) {
  Write-Host "Dominio ja cadastrado: $($existing.id) | enabled=$($existing.enabled)" -ForegroundColor Green
} else {
  $created = Invoke-StripeForm "/payment_method_domains" @{ domain_name = $Domain }
  Write-Host "Dominio cadastrado: $($created.id) | enabled=$($created.enabled)" -ForegroundColor Green
}

Write-Host "`nPronto." -ForegroundColor Cyan
Write-Host "Apple Pay so aparece em Safari/iPhone/Mac com Apple Pay configurado. Em Chrome no Windows ele normalmente nao aparece." -ForegroundColor Yellow
