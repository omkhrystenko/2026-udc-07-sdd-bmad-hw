## Context

See `proposal.md — Why` for motivation and `specs/order-discounts/spec.md` for
the behaviour contract. The constraints that shape the approach:

- `app/src/types.ts` (`Order`, `LineItem`, `Coupon`) and the four functions in
  `app/src/pricing.ts` are a seeded contract — read-only for this change. In
  particular `Coupon` has no per-customer or usage-limit fields, which puts
  single-use coupons out of reach by construction.
- Money is whole kopecks. `noUncheckedIndexedAccess` and `strict` are on; no
  runtime dependencies are available and none should be added.
- The order carries coupon **codes** (`order.coupons: string[]`), while coupon
  **definitions** arrive separately. Resolution from code to definition is
  therefore part of pricing, and a code with no definition is a normal input,
  not an error.

## Goals / Non-Goals

**Goals:**

- One pure entry point that returns a complete breakdown, so a caller never has
  to re-derive how a total was reached.
- Determinism strong enough to test: same order + same catalog + same instant →
  identical breakdown, byte for byte.
- Every rejection carries a reason the UI can turn into a sentence.

**Non-Goals (design level, beyond the proposal's scope):**

- No coupon-combination optimiser. Coupon order is the customer's typing order;
  we never search for the best subset.
- No per-line discount allocation. Nothing downstream needs a per-line net
  price yet, and inventing one would fix a rounding policy we would then be
  stuck with.
- No error type or exception path. Rejection is data, not control flow.

## Decisions

**D1. Cascade over additive percentages.** Tier first, then coupons on the
remainder. Alternative considered: sum the percentages (10% + 15% = 25%). Summing
is simpler to explain but lets the combined discount exceed what either party
agreed to, and, with a fixed-amount coupon in the mix, can drive the goods
portion negative — which then needs a clamp anyway. The cascade makes the clamp
a formality rather than the thing holding the arithmetic together.

**D2. Integer-only arithmetic with a single `roundHalfUp(numerator, denominator)`
helper.** Implemented as `Math.floor((2n + d) / (2d))` rather than
`Math.floor((n + d / 2) / d)`, because the denominator is not always even — for
a category coupon it is the goods subtotal. Alternative considered: compute in
floats and round at the end. Rejected outright: floats on money are exactly the
failure the ticket asks us to prevent, and the doubled form costs nothing.

**D3. Category base as a proportional share of the remainder.** Alternatives:
(a) the category's original subtotal — breaks the cascade, since tier plus
category coupon can then exceed the value of those goods; (b) the whole
remainder — gives a `fresh` coupon a discount on electronics. The proportional
share is the only option that keeps the cascade intact without tracking a
running price per line, which D2's single-rounding rule would otherwise force us
to define.

**D4. Scope occupancy as the coupon-precedence rule.** A `Map<scope, code>`
where scope is the category or the sentinel `"order"`. Alternatives: apply all
coupons (stackable to zero margin), or pick the best subset (combinatorial, and
non-deterministic on ties). Occupancy is O(n), explainable to a customer, and
stable under re-ordering of the catalog — with one exception, which the spec now
states outright: if the catalog holds two entries under the same code, the first
one wins, so re-ordering a catalog that contains such a duplicate can change the
result. That is a defect in the catalog, not a case the engine arbitrates.

**D5. `not-applicable` does not occupy a scope.** Checked before occupancy, so a
coupon that would grant nothing cannot block a later one on the same scope.
Ordering the two checks the other way makes the outcome depend on typing order
in a way no one intended — the kind of behaviour that only shows up in support
tickets.

**D6. `now` as an optional parameter defaulting to `new Date()`.** Alternative:
read the clock inside with no way to override. Rejected: it makes expiry
untestable without faking global time, and it hides an input that genuinely
affects the result. The parameter stays **optional** at the API boundary —
requiring it would push a clock read into every caller for no gain. What the
contract guarantees is narrower and enough: equal order + equal catalog + same
effective instant produce equal breakdowns.

**D7. Rejections as a flat list of `{ code, reason }`.** Alternative: a
`Result`-style union or a thrown `CouponError`. Both force the caller into
control flow for what is a normal outcome — a customer typing a stale code is
routine, not exceptional.

## Risks / Trade-offs

- **Proportional category base is slightly surprising on an invoice.** A 10%
  `fresh` coupon after a 10% tier discount takes 5 400, not 6 000. → The
  breakdown reports the coupon's granted amount explicitly, so the number is
  visible rather than inferred; the reasoning is recorded in
  `docs/spec/pricing-discounts.md` D-5.
- **Half-up rounding always favours the customer**, costing at most half a
  kopeck per discount. → Bounded and deliberate; the alternative (favouring the
  merchant) costs more in support time than it recovers.
- **Scope occupancy will look arbitrary to a customer who typed three coupons.**
  → Mitigated by the `scope-occupied` reason code, which lets the UI say which
  coupon won and why.
- **`priceOrder` grows a parameter if per-customer coupon limits arrive later.**
  → Acceptable: `Coupon` would have to change first, and that is a contract
  change with its own proposal.
- **Multiplying `remaining × categorySubtotal` before dividing** could overflow
  `Number.MAX_SAFE_INTEGER` at absurd order sizes (~10^8 грн). → Well outside
  any real basket; noted rather than defended against, since the alternative is
  BigInt for the whole domain.

## Migration Plan

None required. Purely additive: a new module plus one export line. Rollback is
reverting the commit; nothing persists state and no existing caller changes
behaviour.
