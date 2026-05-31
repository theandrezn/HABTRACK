# HabTrack Stripe Elements setup

The custom checkout is implemented with Stripe Checkout Sessions in `ui_mode=custom`
and Stripe Payment Element. Stripe secrets must never be committed to Git.

## Test mode

1. Replace `STRIPE_PUBLISHABLE_KEY` in `wrangler.toml` with your Stripe test
   publishable key (`pk_test_...`).
2. Confirm that `STRIPE_PRICE_ID` points to the intended test price.
3. Authenticate Wrangler:

```bash
npx wrangler login
```

4. Store the Stripe test secret key securely:

```bash
npx wrangler secret put STRIPE_SECRET_KEY
```

5. Deploy:

```bash
npx wrangler deploy
```

## Live mode

Before production, create or select the live Stripe price and update:

- `STRIPE_PRICE_ID` to the live `price_...` value.
- `STRIPE_PUBLISHABLE_KEY` to the live `pk_live_...` value.
- `STRIPE_SECRET_KEY` through `npx wrangler secret put STRIPE_SECRET_KEY`
  using the live `sk_live_...` value.

Never add an `sk_test_...` or `sk_live_...` key to this repository.
