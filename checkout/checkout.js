(async function () {
  const payButton = document.querySelector("#pay-button");
  const emailInput = document.querySelector("#email");
  const emailErrors = document.querySelector("#email-errors");
  const confirmErrors = document.querySelector("#confirm-errors");

  function setError(element, message) {
    element.textContent = message || "";
  }

  function attribution() {
    const params = new URLSearchParams(window.location.search);
    return ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"]
      .reduce((values, key) => {
        if (params.get(key)) values[key] = params.get(key);
        return values;
      }, {});
  }

  try {
    const configResponse = await fetch("/api/stripe-config", { cache: "no-store" });
    const config = await configResponse.json();
    if (!configResponse.ok || !config.publishableKey || config.publishableKey.includes("REPLACE_WITH")) {
      throw new Error(config.error || "Stripe checkout is not configured yet.");
    }

    const clientSecret = fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attribution: attribution() }),
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
            colorBackground: "#101115",
            colorText: "#ffffff",
            colorDanger: "#ff7b7b",
            colorTextSecondary: "#b7bcc8",
            borderRadius: "5px",
            fontFamily: "Poppins, Arial, sans-serif",
            spacingUnit: "4px",
          },
          rules: {
            ".Input": {
              border: "1px solid #3b3e49",
              boxShadow: "none",
            },
            ".Input:focus": {
              border: "1px solid #00a3ff",
              boxShadow: "0 0 0 3px rgba(0, 163, 255, .15)",
            },
            ".Tab": {
              border: "1px solid #3b3e49",
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

    emailInput.addEventListener("input", () => setError(emailErrors, ""));
    emailInput.addEventListener("blur", async () => {
      if (!emailInput.value.trim()) return;
      const result = await actions.updateEmail(emailInput.value.trim());
      if (result.error) setError(emailErrors, result.error.message);
    });

    payButton.addEventListener("click", async () => {
      setError(confirmErrors, "");
      payButton.disabled = true;
      payButton.textContent = "PROCESSING...";

      const emailResult = await actions.updateEmail(emailInput.value.trim());
      if (emailResult.error) {
        setError(emailErrors, emailResult.error.message);
        payButton.textContent = "PAY $9.90";
        payButton.disabled = false;
        return;
      }

      const result = await actions.confirm();
      if (result.type === "error") {
        setError(confirmErrors, result.error.message);
        payButton.textContent = "PAY $9.90";
        payButton.disabled = false;
      }
    });
  } catch (error) {
    setError(confirmErrors, error.message);
    payButton.textContent = "CHECKOUT UNAVAILABLE";
    payButton.disabled = true;
  }
})();
