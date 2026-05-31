const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2026-02-25.clover";
const ORDER_BUMPS = {
  finance: ["Ultimate Financial Planning Pack", "Annual budgeting and monthly control system.", 199],
  adhd: ["ADHD Productivity Pack", "Goal planner built for focus, structure, and consistent progress.", 199],
  savings: ["52-Week Savings System", "A weekly savings challenge to build your reserve consistently.", 199],
  clarity: ["Clear Mind Guide (PDF)", "A practical mental declutter system for a clearer routine.", 199],
  fitness: ["Weight Management Planner", "Track your progress with a complete meal and weight planner.", 199],
  wallpapers: ["100 Motivational Wallpapers", "More than 100 wallpapers to keep your goals visible every day.", 199],
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
  form.set("ui_mode", "custom");
  form.set("allow_promotion_codes", "true");
  form.set("return_url", `${origin}/checkout/success/?session_id={CHECKOUT_SESSION_ID}`);
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
  form.set("metadata[source]", "habtrack-custom-checkout");
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
  return json({ client_secret: session.client_secret });
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
