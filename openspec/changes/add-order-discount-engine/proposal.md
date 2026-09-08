## Why

Loyalty tiers exist in the code (`tierPercent`) but are never applied to an
order, and there is no coupon handling at all — checkout charges every customer
the full subtotal. The autumn campaign needs both, and needs them to combine in
a way that is deterministic, explainable to a customer, and incapable of
producing a negative total. The written specification for this lives in
`docs/spec/pricing-discounts.md`; this change carries it into the repo.

## What Changes

- New `app/src/discounts.ts` exposing `priceOrder(order, catalog, now?)`, which
  returns a full `PriceBreakdown` instead of a single number: subtotal, tier
  discount, coupon discount, applied coupons, rejected coupons, shipping, total.
- Tier discount is applied to the goods subtotal only; coupons then apply to the
  **remainder** (cascade, never additive percentages).
- Coupon selection rules: at most one coupon per scope (a category, or the whole
  order), first typed wins; duplicates, unknown codes, expired coupons and
  coupons under their minimum subtotal are rejected with a machine-readable
  reason rather than throwing or being silently dropped.
- All money stays in integer kopecks; every discount is rounded half-up exactly
  once, at the discount level — never per line item.
- The total is floored at the shipping amount; shipping is never discounted.
- `app/src/index.ts` re-exports the new public surface.
- No **BREAKING** changes: `types.ts` and `pricing.ts` are untouched and their
  8 existing tests keep passing.

## Capabilities

### New Capabilities
- `order-discounts`: how loyalty tier discounts and coupon codes reduce an
  order's payable total — stacking order, discount base, coupon eligibility and
  precedence, rounding, and the floor on the total.

### Modified Capabilities
<!-- none: existing subtotal/shipping/tier behaviour keeps its current
     requirements; this change only adds behaviour alongside it. -->

## Impact

- **Code:** new `app/src/discounts.ts` and `app/src/discounts.test.ts`; one
  added export line in `app/src/index.ts`. `app/src/pricing.ts` and
  `app/src/types.ts` are read-only for this change (seeded contract).
- **API:** new pure function `priceOrder`; nothing removed or renamed.
- **Dependencies:** none — the domain library stays dependency-free.
- **Consumers:** any checkout UI must now render `rejectedCoupons` to explain
  why a typed code did not apply; the reason codes are stable identifiers and
  the user-facing wording belongs to the UI.
