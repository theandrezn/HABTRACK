param(
  [string]$SiteUrl = "https://habtrack.andrrluis86.workers.dev"
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

function Invoke-StripeGet($Path) {
  $headers = @{ Authorization = "Bearer $script:StripeSecret" }
  return Invoke-RestMethod -Method Get -Uri "https://api.stripe.com/v1$Path" -Headers $headers
}

function Invoke-StripeForm($Path, $Body) {
  $headers = @{ Authorization = "Bearer $script:StripeSecret" }
  return Invoke-RestMethod -Method Post -Uri "https://api.stripe.com/v1$Path" -Headers $headers -Body $Body -ContentType "application/x-www-form-urlencoded"
}

function Invoke-StripeDelete($Path) {
  $headers = @{ Authorization = "Bearer $script:StripeSecret" }
  return Invoke-RestMethod -Method Delete -Uri "https://api.stripe.com/v1$Path" -Headers $headers
}

function Set-WranglerSecret($Name, $Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Valor vazio para secret $Name"
  }
  $Value | npx wrangler secret put $Name
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao salvar secret $Name no Cloudflare."
  }
}

function New-StripeSignature($Payload, $Secret) {
  $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $message = "$timestamp.$Payload"
  $hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($Secret))
  $hash = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($message))
  $hex = ($hash | ForEach-Object { $_.ToString("x2") }) -join ""
  return "t=$timestamp,v1=$hex"
}

Write-Host "HabTrack Stripe Webhook + Access Email Setup" -ForegroundColor Cyan
Write-Host "Endpoint: $SiteUrl/api/stripe-webhook" -ForegroundColor Gray
Write-Host ""

Write-Host "1) Cole sua chave secreta LIVE da Stripe (sk_live_...). Ela nao sera salva nem exibida." -ForegroundColor Yellow
$script:StripeSecret = Read-SecretValue "Stripe secret key"
if (-not $script:StripeSecret.StartsWith("sk_live_")) {
  Write-Host "Aviso: a chave nao parece live. Para vender de verdade use sk_live_." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "2) Cole sua RESEND_API_KEY (re_...). Ela sera salva como secret no Cloudflare." -ForegroundColor Yellow
$resendKey = Read-SecretValue "Resend API key"

Write-Host ""
Write-Host "3) Link que o comprador recebera para acessar o HabTrack." -ForegroundColor Yellow
$accessUrl = Read-Host "HabTrack access URL"
if ([string]::IsNullOrWhiteSpace($accessUrl)) {
  throw "O link de acesso nao pode ficar vazio."
}

Write-Host ""
Write-Host "4) E-mail remetente verificado no Resend. Ex: HabTrack <access@seudominio.com>" -ForegroundColor Yellow
$fromEmail = Read-Host "From email"
if ([string]::IsNullOrWhiteSpace($fromEmail)) {
  throw "O e-mail remetente nao pode ficar vazio."
}

$webhookUrl = "$SiteUrl/api/stripe-webhook"

Write-Host ""
Write-Host "Validando conta Stripe..." -ForegroundColor Cyan
$account = Invoke-StripeGet "/account"
Write-Host "Conta: $($account.id)" -ForegroundColor Green

Write-Host ""
Write-Host "Criando ou reutilizando webhook endpoint na Stripe..." -ForegroundColor Cyan
$endpoints = Invoke-StripeGet "/webhook_endpoints?limit=100"
$existing = @()
if ($endpoints.data) {
  $existing = @($endpoints.data | Where-Object { $_.url -eq $webhookUrl -and $_.status -ne "deleted" })
}

foreach ($item in $existing) {
  Write-Host "Removendo webhook antigo para evitar duplicidade: $($item.id)" -ForegroundColor Yellow
  Invoke-StripeDelete "/webhook_endpoints/$($item.id)" | Out-Null
}

$endpoint = Invoke-StripeForm "/webhook_endpoints" @{
  "url" = $webhookUrl
  "enabled_events[0]" = "checkout.session.completed"
  "enabled_events[1]" = "checkout.session.async_payment_succeeded"
  "description" = "HabTrack access email webhook"
}
Write-Host "Webhook criado: $($endpoint.id)" -ForegroundColor Green
$webhookSecret = $endpoint.secret

if (-not $webhookSecret.StartsWith("whsec_")) {
  throw "Signing secret invalido. Ele deve comecar com whsec_."
}

Write-Host ""
Write-Host "Salvando secrets no Cloudflare..." -ForegroundColor Cyan
Set-WranglerSecret "STRIPE_WEBHOOK_SECRET" $webhookSecret
Set-WranglerSecret "RESEND_API_KEY" $resendKey
Set-WranglerSecret "HABTRACK_ACCESS_URL" $accessUrl
Set-WranglerSecret "HABTRACK_FROM_EMAIL" $fromEmail
Write-Host "Secrets salvos." -ForegroundColor Green

Write-Host ""
Write-Host "Fazendo deploy do Worker..." -ForegroundColor Cyan
npx wrangler deploy
if ($LASTEXITCODE -ne 0) {
  throw "Deploy falhou."
}

$testEmail = Read-Host "E-mail para teste agora (Enter para pular)"
if (-not [string]::IsNullOrWhiteSpace($testEmail)) {
  Write-Host "Enviando evento webhook assinado de teste..." -ForegroundColor Cyan
  $testSessionId = "cs_live_habtrack_manual_test_" + ([guid]::NewGuid().ToString("N").Substring(0, 16))
  $payloadObject = @{
    id = "evt_habtrack_test_" + ([guid]::NewGuid().ToString("N").Substring(0, 12))
    type = "checkout.session.completed"
    data = @{
      object = @{
        id = $testSessionId
        payment_status = "paid"
        customer_details = @{ email = $testEmail }
        metadata = @{ order_bumps = "finance,adhd,savings,clarity,fitness,wallpapers,updates" }
      }
    }
  }
  $payload = $payloadObject | ConvertTo-Json -Depth 8 -Compress
  $signature = New-StripeSignature $payload $webhookSecret
  $response = Invoke-RestMethod -Method Post -Uri $webhookUrl -Headers @{ "Stripe-Signature" = $signature } -ContentType "application/json" -Body $payload
  Write-Host "Resposta do webhook: $($response | ConvertTo-Json -Compress)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Pronto. A Stripe agora chamara $webhookUrl quando o Checkout for pago." -ForegroundColor Cyan
