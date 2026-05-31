const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2026-02-25.clover";
const RESEND_API = "https://api.resend.com/emails";
const ORDER_BUMPS = {
  finance: ["Ultimate Money Planner Pack", "All-in-one money system: annual budget and monthly tracker.", 199],
  adhd: ["ADHD Productivity Pack", "ADHD goal planner built for focus, structure, and consistent wins.", 199],
  savings: ["52-Week Saving System", "Weekly savings challenge and planner for consistent saving.", 199],
  clarity: ["Clear Mind PDF", "Brain dump system to capture, sort, and clear mental clutter fast.", 199],
  fitness: ["Weight-Loss Planner Bundle", "Hit your goal weight with a proven tracker and meal planner combo.", 199],
  wallpapers: ["100-Pack Motivational Quote Phone Wallpaper", "100+ wallpapers that rewire your phone into a focus tool.", 199],
  updates: ["Lifetime Updates", "Receive future improvements to the HabTrack system.", 199],
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/stripe-config" && request.method === "GET") {
      return json({
        publishableKey: env.STRIPE_PUBLISHABLE_KEY || "",
      });
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
  form.set("success_url", `${origin}/checkout/success/?session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${origin}/`);
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][unit_amount]", "990");
  form.set("line_items[0][price_data][product_data][name]", "HabTrack - Habit + Task Tracker");
  form.set("line_items[0][price_data][product_data][description]", "Instant digital download with lifetime access.");
  form.set("line_items[0][quantity]", "1");
  const selectedBumps = cleanOrderBumps(body.bumps);
  selectedBumps.forEach((id, offset) => {
    const [name, description, amount] = ORDER_BUMPS[id];
    const index = offset + 1;
    form.set(`line_items[${index}][price_data][currency]`, "usd");
    form.set(`line_items[${index}][price_data][unit_amount]`, String(amount));
    form.set(`line_items[${index}][price_data][product_data][name]`, name);
    form.set(`line_items[${index}][price_data][product_data][description]`, description);
    form.set(`line_items[${index}][quantity]`, "1");
  });
  form.set("metadata[product]", "habtrack-habit-task-system");
  form.set("metadata[source]", "habtrack-hosted-checkout");
  form.set("metadata[order_bumps]", selectedBumps.join(","));

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
    orderBumps: session.metadata?.order_bumps || "",
  });
  if (!emailResult.ok) return json({ error: emailResult.error }, 502);

  return json({ received: true, email_sent: true });
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
  });
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
  const allowed = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"];
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

function safeEqual(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

async function sendAccessEmail({ env, to, sessionId, orderBumps }) {
  const accessUrl = env.HABTRACK_ACCESS_URL;
  const subject = "Your HabTrack access is ready";
  const bumpLine = orderBumps ? `<p><strong>Included extras:</strong> ${escapeHtml(orderBumps)}</p>` : "";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#111827">
      <h1 style="margin:0 0 16px">Welcome to HabTrack</h1>
      <p>Your payment was confirmed and your HabTrack access is ready.</p>
      <p><a href="${escapeHtml(accessUrl)}" style="display:inline-block;background:#00a3ff;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:700">Open HabTrack</a></p>
      <p>If the button does not work, copy this link into your browser:</p>
      <p><a href="${escapeHtml(accessUrl)}">${escapeHtml(accessUrl)}</a></p>
      ${bumpLine}
      <p style="color:#6b7280;font-size:13px">Order reference: ${escapeHtml(sessionId || "HabTrack order")}</p>
    </div>`;
  const text = [
    "Welcome to HabTrack",
    "",
    "Your payment was confirmed and your HabTrack access is ready.",
    "",
    `Access link: ${accessUrl}`,
    orderBumps ? `Included extras: ${orderBumps}` : "",
    sessionId ? `Order reference: ${sessionId}` : "",
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
