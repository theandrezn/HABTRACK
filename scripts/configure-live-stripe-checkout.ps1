$ErrorActionPreference = "Stop"

function Read-RequiredSecret($Label) {
  $value = Read-Host $Label
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "$Label nao pode ficar vazio."
  }
  return $value.Trim()
}

function Set-WranglerSecret($Name, $Value) {
  $temp = New-TemporaryFile
  try {
    [System.IO.File]::WriteAllText($temp.FullName, $Value, [System.Text.Encoding]::UTF8)
    Get-Content -Raw $temp.FullName | npx wrangler secret put $Name --name habtrack
  } finally {
    Remove-Item -LiteralPath $temp.FullName -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-Stripe($Method, $Path, $SecretKey, $Body = $null) {
  $bytes = [System.Text.Encoding]::ASCII.GetBytes("${SecretKey}:")
  $headers = @{
    Authorization = "Basic " + [Convert]::ToBase64String($bytes)
    "Stripe-Version" = "2026-02-25.clover"
  }
  $uri = "https://api.stripe.com/v1$Path"
  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
  }
  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers -Body $Body -ContentType "application/x-www-form-urlencoded"
}

Write-Host ""
Write-Host "HabTrack Stripe Live Checkout Setup" -ForegroundColor Cyan
Write-Host "Cole as chaves quando solicitado. Elas nao serao gravadas no codigo." -ForegroundColor Yellow
Write-Host ""

$stripeSecret = Read-RequiredSecret "STRIPE_SECRET_KEY live (sk_live_...)"

if (-not $stripeSecret.StartsWith("sk_live_")) {
  Write-Host "Aviso: essa chave nao comeca com sk_live_. Confira se voce quer mesmo usar essa chave." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Validando conta Stripe..." -ForegroundColor Cyan
$account = Invoke-Stripe "GET" "/account" $stripeSecret
Write-Host "Conta: $($account.id) | Nome publico: $($account.settings.dashboard.display_name)" -ForegroundColor Green

Write-Host ""
Write-Host "Salvando STRIPE_SECRET_KEY no Cloudflare..." -ForegroundColor Cyan
Set-WranglerSecret "STRIPE_SECRET_KEY" $stripeSecret

$webhookUrl = "https://habtrack.shop/api/stripe-webhook"
Write-Host ""
Write-Host "Procurando webhook existente para $webhookUrl..." -ForegroundColor Cyan
$endpoints = Invoke-Stripe "GET" "/webhook_endpoints?limit=100" $stripeSecret
$existing = $endpoints.data | Where-Object { $_.url -eq $webhookUrl -and -not $_.deleted } | Select-Object -First 1

if ($existing) {
  Write-Host "Webhook ja existe: $($existing.id)" -ForegroundColor Green
  Write-Host "A Stripe nao revela novamente o signing secret de um webhook existente." -ForegroundColor Yellow
  $webhookSecret = Read-Host "Cole o STRIPE_WEBHOOK_SECRET existente (whsec_...) ou aperte Enter para recriar o webhook"
  if ([string]::IsNullOrWhiteSpace($webhookSecret)) {
    Write-Host "Desativando webhook antigo e criando um novo..." -ForegroundColor Yellow
    Invoke-Stripe "POST" "/webhook_endpoints/$($existing.id)" $stripeSecret "disabled=true" | Out-Null
    $existing = $null
  }
}

if (-not $existing) {
  Write-Host "Criando webhook live na Stripe..." -ForegroundColor Cyan
  $body = "url=$([uri]::EscapeDataString($webhookUrl))&enabled_events[]=checkout.session.completed&enabled_events[]=checkout.session.async_payment_succeeded&description=$([uri]::EscapeDataString('HabTrack access delivery webhook'))"
  $created = Invoke-Stripe "POST" "/webhook_endpoints" $stripeSecret $body
  $webhookSecret = $created.secret
  Write-Host "Webhook criado: $($created.id)" -ForegroundColor Green
}

if (-not [string]::IsNullOrWhiteSpace($webhookSecret)) {
  if (-not $webhookSecret.Trim().StartsWith("whsec_")) {
    throw "STRIPE_WEBHOOK_SECRET invalido. Esperado whsec_..."
  }
  Write-Host "Salvando STRIPE_WEBHOOK_SECRET no Cloudflare..." -ForegroundColor Cyan
  Set-WranglerSecret "STRIPE_WEBHOOK_SECRET" $webhookSecret.Trim()
}

Write-Host ""
$resendKey = Read-Host "RESEND_API_KEY (re_...) para email de acesso, ou Enter para pular"
if (-not [string]::IsNullOrWhiteSpace($resendKey)) {
  Set-WranglerSecret "RESEND_API_KEY" $resendKey.Trim()
}

$metaToken = Read-Host "META_CAPI_TOKEN para Purchase via Meta CAPI, ou Enter para pular"
if (-not [string]::IsNullOrWhiteSpace($metaToken)) {
  Set-WranglerSecret "META_CAPI_TOKEN" $metaToken.Trim()
}

Write-Host ""
Write-Host "Fazendo deploy do Worker..." -ForegroundColor Cyan
npx wrangler deploy

Write-Host ""
Write-Host "Testando criacao de Checkout live..." -ForegroundColor Cyan
$checkoutBody = '{"bumps":["finance","adhd","savings","clarity","fitness","wallpapers","updates"],"attribution":{"utm_source":"codex_setup"},"event_id":"codex_live_checkout_setup"}'
$checkout = Invoke-RestMethod -Uri "https://habtrack.shop/api/create-checkout-session" -Method Post -ContentType "application/json" -Body $checkoutBody
Write-Host "Checkout criado: $($checkout.id)" -ForegroundColor Green
Write-Host $checkout.url

Write-Host ""
Write-Host "Pronto. Se RESEND_API_KEY e STRIPE_WEBHOOK_SECRET foram salvos, o webhook enviara email de acesso apos pagamento confirmado." -ForegroundColor Green
