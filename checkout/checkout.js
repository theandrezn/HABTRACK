(async function () {
  const form = document.querySelector("#checkout-form");
  const payButton = document.querySelector("#pay-button");
  const emailInput = document.querySelector("#email");
  const emailErrors = document.querySelector("#email-errors");
  const confirmErrors = document.querySelector("#confirm-errors");
  const couponToggle = document.querySelector("#coupon-toggle");
  const couponPanel = document.querySelector("#coupon-panel");
  const couponInput = document.querySelector("#coupon-code");
  const couponMessage = document.querySelector("#coupon-message");
  const applyCoupon = document.querySelector("#apply-coupon");
  const removeCoupon = document.querySelector("#remove-coupon");
  const orderTotal = document.querySelector("#order-total");
  const orderSummaryCopy = document.querySelector("#order-summary-copy");

  function setMessage(element, message, success) {
    element.textContent = message || "";
    element.classList.toggle("is-success", Boolean(success));
  }

  function attribution() {
    const params = new URLSearchParams(window.location.search);
    return ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"]
      .reduce((values, key) => {
        if (params.get(key)) values[key] = params.get(key);
        return values;
      }, {});
  }

  function selectedBumps() {
    const value = new URLSearchParams(window.location.search).get("bumps");
    return value ? value.split(",").filter(Boolean) : [];
  }

  function paymentLabel() {
    return "Pay $" + ((990 + selectedBumps().length * 199) / 100).toFixed(2);
  }

  const bumpCount = selectedBumps().length;
  orderTotal.textContent = "$" + ((990 + bumpCount * 199) / 100).toFixed(2);
  orderSummaryCopy.textContent = bumpCount ? "Instant digital access + " + bumpCount + " selected extras" : "Instant digital access";
  payButton.textContent = paymentLabel();

  couponToggle.addEventListener("click", () => {
    const expanded = couponToggle.getAttribute("aria-expanded") === "true";
    couponToggle.setAttribute("aria-expanded", String(!expanded));
    couponPanel.hidden = expanded;
    if (!expanded) couponInput.focus();
  });

  try {
    const configResponse = await fetch("/api/stripe-config", { cache: "no-store" });
    const config = await configResponse.json();
    if (!configResponse.ok || !config.publishableKey || config.publishableKey.includes("REPLACE_WITH")) {
      throw new Error(config.error || "Stripe checkout is not configured yet.");
    }

    const clientSecret = fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attribution: attribution(), bumps: selectedBumps() }),
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.client_secret) throw new Error(body.error || "Unable to start checkout.");
        return body.client_secret;
      });

    const stripe = Stripe(config.publishableKey);
    const checkout = stripe.initCheckout({
      clientSecret,
      elementsOptions: {
        appearance: {
          theme: "night",
          variables: {
            colorPrimary: "#00a3ff",
            colorBackground: "#111216",
            colorText: "#f7f8fb",
            colorDanger: "#ff9696",
            colorTextSecondary: "#aeb4bf",
            borderRadius: "6px",
            fontFamily: "Poppins, Arial, sans-serif",
            spacingUnit: "4px",
          },
          rules: {
            ".Input": {
              border: "1px solid #444752",
              boxShadow: "none",
            },
            ".Input:focus": {
              border: "1px solid #00a3ff",
              boxShadow: "0 0 0 3px rgba(0, 163, 255, .16)",
            },
            ".Tab": {
              border: "1px solid #444752",
            },
          },
        },
      },
    });

    checkout.on("change", (session) => {
      payButton.disabled = !session.canConfirm;
    });

    const result = await checkout.loadActions();
    if (result.type !== "success") throw new Error("Unable to load payment options.");
    const { actions } = result;

    const paymentElement = checkout.createPaymentElement({
      layout: { type: "accordion", defaultCollapsed: false, radios: true },
    });
    paymentElement.mount("#payment-element");

    emailInput.addEventListener("input", () => setMessage(emailErrors, ""));
    emailInput.addEventListener("blur", async () => {
      if (!emailInput.value.trim()) return;
      const result = await actions.updateEmail(emailInput.value.trim());
      if (result.error) setMessage(emailErrors, result.error.message);
    });

    applyCoupon.addEventListener("click", async () => {
      const code = couponInput.value.trim();
      if (!code) {
        setMessage(couponMessage, "Enter a coupon code to continue.");
        return;
      }

      applyCoupon.disabled = true;
      setMessage(couponMessage, "Applying coupon...");
      const result = await actions.applyPromotionCode(code);
      applyCoupon.disabled = false;

      if (result.error) {
        setMessage(couponMessage, result.error.message);
        return;
      }

      couponInput.value = "";
      removeCoupon.hidden = false;
      setMessage(couponMessage, "Coupon applied.", true);
    });

    removeCoupon.addEventListener("click", async () => {
      await actions.removePromotionCode();
      removeCoupon.hidden = true;
      setMessage(couponMessage, "Coupon removed.", true);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage(confirmErrors, "");
      payButton.disabled = true;
      payButton.textContent = "Processing...";

      const emailResult = await actions.updateEmail(emailInput.value.trim());
      if (emailResult.error) {
        setMessage(emailErrors, emailResult.error.message);
        payButton.textContent = paymentLabel();
        payButton.disabled = false;
        return;
      }

      const result = await actions.confirm();
      if (result.type === "error") {
        setMessage(confirmErrors, result.error.message);
        payButton.textContent = paymentLabel();
        payButton.disabled = false;
      }
    });
  } catch (error) {
    setMessage(confirmErrors, error.message);
    payButton.textContent = "Checkout unavailable";
    payButton.disabled = true;
  }
})();
