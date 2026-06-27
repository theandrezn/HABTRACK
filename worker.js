const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2026-02-25.clover";
const RESEND_API = "https://api.resend.com/emails";
const ORDER_BUMPS = {
  finance: ["Ultimate Money Planner Pack", "All-in-one money system: annual budget and monthly tracker.", 199, "images/financial-profit.png"],
  adhd: ["ADHD Productivity Pack", "ADHD goal planner built for focus, structure, and consistent wins.", 199, "images/adhd.png"],
  savings: ["52-Week Saving System", "Weekly savings challenge and planner for consistent saving.", 199, "images/Gemini_Generated_Image_mvlz05mvlz05mvlz-Edited.png"],
  clarity: ["Clear Mind PDF", "Brain dump system to capture, sort, and clear mental clutter fast.", 199, "images/think_6fc2c6f0-f133-40ff-a8cd-4e5c14a19386.png"],
  fitness: ["Weight-Loss Planner Bundle", "Hit your goal weight with a proven tracker and meal planner combo.", 199, "images/weight-loss.png"],
  wallpapers: ["100-Pack Motivational Quote Phone Wallpaper", "100+ wallpapers that rewire your phone into a focus tool.", 199, "images/photo_1.png"],
  updates: ["Lifetime Updates", "Receive future improvements to the HabTrack system.", 199, "images/updated_ffb31b52-f3b9-4ba7-aade-f77e3dfab0f9.png"],
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isThankYouHost = url.hostname === "thankyou.habtrack.shop";

    if (url.pathname === "/api/stripe-config" && request.method === "GET") {
      return json({
        publishableKey: env.STRIPE_PUBLISHABLE_KEY || "",
      });
    }

    if (url.pathname === "/v2") {
      const redirectUrl = new URL(request.url);
      redirectUrl.pathname = "/v2/";
      return Response.redirect(redirectUrl.toString(), 301);
    }

    if (url.pathname === "/api/create-checkout-session" && request.method === "POST") {
      return createCheckoutSession(request, env);
    }

    if (url.pathname === "/api/checkout-session" && request.method === "GET") {
      return getCheckoutSession(url, env);
    }

    if (url.pathname === "/api/stripe-webhook" && request.method === "POST") {
      return handleStripeWebhook(request, env);
    }

    if (url.pathname === "/checkout/checkout.js") {
      return new Response("Not found", { status: 404 });
    }

    if (isThankYouHost && (url.pathname === "/" || url.pathname === "/index.html")) {
      const successUrl = new URL(request.url);
      successUrl.pathname = "/checkout/success/";
      return env.ASSETS.fetch(new Request(successUrl, request));
    }

    return env.ASSETS.fetch(request);
  },
};

async function createCheckoutSession(request, env) {
  const missing = requiredStripeConfig(env);
  if (missing) return json({ error: missing }, 500);

  let body = {};
  try {
    body = await request.json();
  } catch {
    // Attribution is optional.
  }

  const origin = new URL(request.url).origin;
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("locale", "en");
  form.set("allow_promotion_codes", "true");
  form.set("success_url", "https://thanyouhabtrack.pages.dev/?session_id={CHECKOUT_SESSION_ID}");
  form.set("cancel_url", `${origin}/`);
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][unit_amount]", "500");
  form.set("line_items[0][price_data][product_data][name]", "HabTrack - Habit + Task Tracker");
  form.set("line_items[0][price_data][product_data][description]", "Instant digital download with lifetime access.");
  form.set("line_items[0][price_data][product_data][images][0]", `${origin}/images/habtrack-first-gallery-optimized.webp`);
  form.set("line_items[0][quantity]", "1");
  const selectedBumps = cleanOrderBumps(body.bumps);
  selectedBumps.forEach((id, offset) => {
    const [name, description, amount, imagePath] = ORDER_BUMPS[id];
    const index = offset + 1;
    form.set(`line_items[${index}][price_data][currency]`, "usd");
    form.set(`line_items[${index}][price_data][unit_amount]`, String(amount));
    form.set(`line_items[${index}][price_data][product_data][name]`, name);
    form.set(`line_items[${index}][price_data][product_data][description]`, description);
    form.set(`line_items[${index}][price_data][product_data][images][0]`, `${origin}/${imagePath}`);
    form.set(`line_items[${index}][quantity]`, "1");
  });
  form.set("metadata[product]", "habtrack-habit-task-system");
  form.set("metadata[source]", "habtrack-hosted-checkout");
  form.set("metadata[order_bumps]", selectedBumps.join(","));
  if (typeof body.event_id === "string" && body.event_id.trim()) {
    form.set("metadata[event_id]", body.event_id.trim().slice(0, 120));
  }
  form.set("metadata[event_source_url]", origin);
  form.set("metadata[client_ip]", request.headers.get("CF-Connecting-IP") || "");
  form.set("metadata[client_user_agent]", (request.headers.get("User-Agent") || "").slice(0, 450));

  const attribution = cleanAttribution(body.attribution);
  Object.entries(attribution).forEach(([key, value]) => {
    form.set(`metadata[${key}]`, value);
  });

  const response = await stripeRequest("/checkout/sessions", env, {
    method: "POST",
    body: form,
  });

  if (!response.ok) return stripeError(response);
  const session = await response.json();
  const metaResult = await sendMetaInitiateCheckoutEvent({
    env,
    eventId: body.event_id,
    attribution,
    amountTotal: 500 + selectedBumps.length * 199,
    orderBumps: selectedBumps,
    request,
  });
  if (metaResult.error) {
    console.warn("Meta InitiateCheckout error:", metaResult.error);
  }
  return json({ id: session.id, url: session.url });
}

async function handleStripeWebhook(request, env) {
  const payload = await request.text();
  const signature = request.headers.get("Stripe-Signature") || "";
  const event = await verifyStripeWebhook(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!event.ok) return json({ error: event.error }, 400);

  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.data.type)) {
    return json({ received: true, ignored: true });
  }

  const session = event.data.data?.object || {};
  if (session.payment_status && session.payment_status !== "paid") {
    return json({ received: true, ignored: "payment_not_paid" });
  }

  const email = session.customer_details?.email || session.customer_email;
  if (!email) return json({ error: "Checkout session did not include a customer email." }, 400);

  const missing = requiredEmailConfig(env);
  if (missing) return json({ error: missing }, 500);

  const emailResult = await sendAccessEmail({
    env,
    to: email,
    sessionId: session.id,
    paymentIntent: session.payment_intent,
    orderBumps: session.metadata?.order_bumps || "",
  });
  if (!emailResult.ok) return json({ error: emailResult.error }, 502);

  const metaResult = await sendMetaPurchaseEvent({ env, session, email });

  return json({ received: true, email_sent: true, meta_sent: metaResult.sent, meta_error: metaResult.error || undefined });
}

async function getCheckoutSession(url, env) {
  const missing = requiredStripeConfig(env);
  if (missing) return json({ error: missing }, 500);

  const sessionId = url.searchParams.get("session_id");
  if (!sessionId || !/^cs_(test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) {
    return json({ error: "Invalid checkout session." }, 400);
  }

  const response = await stripeRequest(`/checkout/sessions/${sessionId}`, env);
  if (!response.ok) return stripeError(response);

  const session = await response.json();
  return json({
    id: session.id,
    status: session.status,
    payment_status: session.payment_status,
    customer_email: session.customer_details?.email || session.customer_email || "",
    amount_total: session.amount_total || 0,
    currency: String(session.currency || "usd").toUpperCase(),
    item_count: 1 + cleanOrderBumps((session.metadata?.order_bumps || "").split(",")).length,
  });
}

async function sendMetaPurchaseEvent({ env, session, email }) {
  if (!env.META_CAPI_TOKEN) return { sent: false };

  const metadata = session.metadata || {};
  const userData = cleanObject({
    em: email ? [await sha256Hex(String(email).trim().toLowerCase())] : undefined,
    fbp: metadata.fbp,
    fbc: metadata.fbc,
    client_ip_address: metadata.client_ip,
    client_user_agent: metadata.client_user_agent,
  });
  const orderBumps = cleanOrderBumps((metadata.order_bumps || "").split(","));
  const contentIds = ["habtrack-habit-task-system", ...orderBumps];
  const payload = {
    data: [{
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_id: session.id,
      action_source: "website",
      event_source_url: metadata.event_source_url || "https://habtrack.shop",
      user_data: userData,
      custom_data: {
        currency: String(session.currency || "usd").toUpperCase(),
        value: Number(session.amount_total || 0) / 100,
        order_id: session.id,
        content_name: "HabTrack - Habit + Task Tracker",
        content_ids: contentIds,
        contents: contentIds.map((id) => ({ id, quantity: 1 })),
        num_items: contentIds.length,
      },
    }],
  };

  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/27284228041269455/events?access_token=${env.META_CAPI_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) return { sent: true };
    const body = await response.text();
    return { sent: false, error: body.slice(0, 300) };
  } catch (error) {
    return { sent: false, error: error.message || "Meta CAPI request failed." };
  }
}

async function sendMetaInitiateCheckoutEvent({ env, eventId, attribution, amountTotal, orderBumps, request }) {
  if (!env.META_CAPI_TOKEN || !eventId) return { sent: false };

  const metadata = attribution || {};
  const contentIds = ["habtrack-habit-task-system", ...orderBumps];
  const payload = {
    data: [{
      event_name: "InitiateCheckout",
      event_time: Math.floor(Date.now() / 1000),
      event_id: String(eventId).slice(0, 120),
      action_source: "website",
      event_source_url: metadata.source_url || metadata.event_source_url || "https://habtrack.shop",
      user_data: cleanObject({
        fbp: metadata.fbp,
        fbc: metadata.fbc,
        client_ip_address: request.headers.get("CF-Connecting-IP") || "",
        client_user_agent: request.headers.get("User-Agent") || "",
      }),
      custom_data: {
        currency: "USD",
        value: amountTotal / 100,
        content_name: "HabTrack - Habit + Task Tracker",
        content_ids: contentIds,
        contents: contentIds.map((id) => ({ id, quantity: 1 })),
        num_items: contentIds.length,
      },
    }],
  };

  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/27284228041269455/events?access_token=${env.META_CAPI_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) return { sent: true };
    const body = await response.text();
    return { sent: false, error: body.slice(0, 300) };
  } catch (error) {
    return { sent: false, error: error.message || "Meta InitiateCheckout request failed." };
  }
}

function requiredStripeConfig(env) {
  if (!env.STRIPE_SECRET_KEY) return "Stripe secret is not configured.";
  if (!env.STRIPE_PUBLISHABLE_KEY || env.STRIPE_PUBLISHABLE_KEY.includes("REPLACE_WITH")) {
    return "Stripe publishable key is not configured.";
  }
  return "";
}

function requiredEmailConfig(env) {
  if (!env.STRIPE_WEBHOOK_SECRET) return "Stripe webhook secret is not configured.";
  if (!env.RESEND_API_KEY) return "Resend API key is not configured.";
  if (!env.HABTRACK_ACCESS_URL) return "HabTrack access URL is not configured.";
  if (!env.HABTRACK_FROM_EMAIL) return "HabTrack sender email is not configured.";
  return "";
}

function cleanAttribution(value) {
  if (!value || typeof value !== "object") return {};
  const allowed = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid", "fbp", "fbc", "source_url"];
  return allowed.reduce((metadata, key) => {
    if (typeof value[key] === "string" && value[key].trim()) {
      metadata[key] = value[key].trim().slice(0, 450);
    }
    return metadata;
  }, {});
}

function cleanOrderBumps(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id) => typeof id === "string" && ORDER_BUMPS[id]))];
}

async function verifyStripeWebhook(payload, signatureHeader, secret) {
  if (!secret) return { ok: false, error: "Stripe webhook secret is not configured." };
  const values = Object.fromEntries(signatureHeader.split(",").map((part) => {
    const index = part.indexOf("=");
    return index === -1 ? ["", ""] : [part.slice(0, index), part.slice(index + 1)];
  }).filter(([key]) => key));

  const timestamp = values.t;
  const signature = values.v1;
  if (!timestamp || !signature) return { ok: false, error: "Missing Stripe webhook signature." };
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    return { ok: false, error: "Stripe webhook timestamp is outside tolerance." };
  }

  const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
  if (!safeEqual(signature, expected)) return { ok: false, error: "Invalid Stripe webhook signature." };

  try {
    return { ok: true, data: JSON.parse(payload) };
  } catch {
    return { ok: false, error: "Invalid Stripe webhook payload." };
  }
}

async function hmacSha256Hex(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(message) {
  const encoder = new TextEncoder();
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(message)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cleanObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => {
    if (Array.isArray(item)) return item.length > 0 && item.every(Boolean);
    return Boolean(item);
  }));
}

function safeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

async function sendAccessEmail({ env, to, sessionId, paymentIntent, orderBumps }) {
  const accessUrl = normalizeAccessUrl(env.HABTRACK_ACCESS_URL);
  const accessLabel = formatAccessLabel(accessUrl);
  const orderReference = paymentIntent || sessionId || "HabTrack order";
  const subject = "Your HabTrack access is ready";
  const preheader = "Payment confirmed. Your HabTrack dashboard and bonus materials are ready.";
  const includedExtras = getOrderBumpNames(orderBumps);
  const extrasHtml = includedExtras.length ? `
            <tr>
              <td style="padding:0 32px 24px 32px;">
                <p style="margin:0 0 10px 0;font-family:Arial,sans-serif;font-size:14px;line-height:20px;color:#111827;font-weight:700;">Included with your order</p>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                  ${includedExtras.map((extra) => `
                  <tr>
                    <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:14px;line-height:20px;color:#374151;">${escapeHtml(extra)}</td>
                  </tr>`).join("")}
                </table>
              </td>
            </tr>` : "";
  const textExtras = includedExtras.length ? [
    "Included with your order:",
    ...includedExtras.map((extra) => `- ${extra}`),
    "",
  ] : [];
  const replyTo = env.HABTRACK_REPLY_TO || extractEmailAddress(env.HABTRACK_FROM_EMAIL) || "access@habtrack.shop";
  const html = `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f6f7fb;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</span>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#f6f7fb;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;max-width:600px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 14px 32px;font-family:Arial,sans-serif;font-size:16px;line-height:22px;color:#111827;font-weight:700;">HabTrack</td>
            </tr>
            <tr>
              <td style="padding:0 32px 12px 32px;">
                <h1 style="margin:0;font-family:Arial,sans-serif;font-size:24px;line-height:32px;color:#111827;font-weight:700;">Your HabTrack access is ready</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;">
                <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:24px;color:#374151;">Hi, your payment has been confirmed and your HabTrack access is now active.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <p style="margin:0 0 6px 0;font-family:Arial,sans-serif;font-size:13px;line-height:18px;color:#6b7280;">Access link</p>
                      <p style="margin:0;font-family:Arial,sans-serif;font-size:16px;line-height:24px;color:#111827;font-weight:700;">${escapeHtml(accessLabel)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 20px 32px;">
                <a href="${escapeHtml(accessUrl)}" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-family:Arial,sans-serif;font-size:15px;line-height:20px;font-weight:700;text-decoration:none;border-radius:8px;padding:13px 20px;">Open HabTrack</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;">
                <p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:13px;line-height:20px;color:#6b7280;">If the button does not work, copy and paste this link into your browser:</p>
                <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;line-height:20px;color:#2563eb;word-break:break-word;"><a href="${escapeHtml(accessUrl)}" style="color:#2563eb;text-decoration:underline;">${escapeHtml(accessLabel)}</a></p>
              </td>
            </tr>
            ${extrasHtml}
            <tr>
              <td style="padding:0 32px 26px 32px;">
                <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;line-height:20px;color:#6b7280;">Order reference: ${escapeHtml(orderReference)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 32px 28px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
                <p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:#6b7280;">You are receiving this email because a payment was confirmed for HabTrack.</p>
                <p style="margin:0 0 8px 0;font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:#6b7280;">Need help? Reply to this email or contact support.</p>
                <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:#6b7280;">HabTrack &mdash; Digital access delivery</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  const text = [
    "Your HabTrack access is ready",
    "",
    "Hi,",
    "",
    "Your payment has been confirmed and your HabTrack access is now active.",
    "",
    "Open HabTrack:",
    accessLabel,
    "",
    ...textExtras,
    "Order reference:",
    orderReference,
    "",
    "You are receiving this email because a payment was confirmed for HabTrack.",
    "",
    "Need help? Reply to this email.",
    "",
    "HabTrack",
  ].filter(Boolean).join("\n");

  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": sessionId || crypto.randomUUID(),
    },
    body: JSON.stringify({
      from: env.HABTRACK_FROM_EMAIL,
      to: [to],
      reply_to: replyTo,
      subject,
      html,
      text,
    }),
  });

  if (response.ok) return { ok: true };

  let error = "Resend could not send the access email.";
  try {
    const body = await response.json();
    if (body.message) error = body.message;
    if (body.error?.message) error = body.error.message;
  } catch {
    // Keep fallback.
  }
  return { ok: false, error };
}

function getOrderBumpNames(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((id) => ORDER_BUMPS[id]?.[0])
    .filter(Boolean);
}

function normalizeAccessUrl(value) {
  const url = String(value || "").trim();
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function formatAccessLabel(value) {
  return String(value)
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
}

function extractEmailAddress(value) {
  const text = String(value || "");
  const match = text.match(/<([^>]+)>/);
  return (match ? match[1] : text).trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function stripeRequest(path, env, init = {}) {
  return fetch(`${STRIPE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Stripe-Version": STRIPE_VERSION,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(init.headers || {}),
    },
  });
}

async function stripeError(response) {
  let message = "Stripe could not start the payment.";
  try {
    const body = await response.json();
    if (body.error?.message) message = body.error.message;
  } catch {
    // Keep the customer-facing fallback.
  }
  return json({ error: message }, response.status || 500);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
