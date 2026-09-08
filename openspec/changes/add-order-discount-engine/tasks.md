## 1. Module skeleton and contract

- [ ] 1.1 Create `app/src/discounts.ts` with the public types from
  `docs/spec/pricing-discounts.md` §5 (`CouponRejectionReason`,
  `AppliedCoupon`, `RejectedCoupon`, `PriceBreakdown`) and the signature
  `priceOrder(order, catalog, now?)`; verify with `cd app && npm run typecheck`
- [ ] 1.2 Add the integer `roundHalfUp(numerator, denominator)` helper per
  design D2 (`Math.floor((2n + d) / (2d))`); verify it returns 616 for
  `roundHalfUp(12_310 * 5, 100)` — the AC-8 half-kopeck case

## 2. Tier discount and totals

- [ ] 2.1 Compute the goods subtotal via the existing `subtotalKopecks` and the
  tier discount as `roundHalfUp(subtotal * tierPercent(order), 100)`; verify
  with the AC-1 and AC-8 tests
- [ ] 2.2 Assemble the breakdown and add `shippingKopecks(order)` after all
  discounts, never before; verify with the AC-6 (international shipping) and
  AC-14 (no tier, no coupons) tests

## 3. Coupon resolution and rejection

- [ ] 3.1 Resolve each code in `order.coupons` against the catalog in typing
  order, rejecting unresolved codes as `unknown`; verify with the AC-12 test
- [ ] 3.2 Reject a repeated code as `duplicate` and an expired coupon
  (`now >= expiresAt`, `now` an explicit parameter) as `expired`; verify with
  the AC-11 and AC-2 tests
- [ ] 3.3 Reject a coupon whose `minSubtotalKopecks` exceeds the **pre-discount**
  goods subtotal as `below-min-subtotal`; verify with both halves of the AC-7
  test (threshold met at exactly 50 000, not met at 50 001)

## 4. Scope rules and discount amounts

- [ ] 4.1 Compute the scope base — `remaining` for an order-wide coupon,
  `roundHalfUp(remaining * categorySubtotal, goodsSubtotal)` for a category
  coupon; verify with the AC-10 test (base 54 000, discount 5 400)
- [ ] 4.2 Reject a coupon with a zero scope base as `not-applicable` **before**
  the occupancy check, so it does not consume the scope; verify with the AC-13
  test (a second `digital` coupon is still considered)
- [ ] 4.3 Enforce one coupon per scope (category, or `"order"`), rejecting later
  competitors as `scope-occupied`; verify with the AC-3 test
- [ ] 4.4 Apply `discount = min(rawDiscount, scopeBase)` and subtract it from
  `remaining`, so a fixed coupon larger than the order forfeits the remainder;
  verify with the AC-4 test (total equals shipping alone, never negative)

## 5. Tests, exports and traceability

- [ ] 5.1 Write `app/src/discounts.test.ts` with one test per criterion, each
  named `AC-N: ...`, covering AC-1 … AC-15 including the AC-4, AC-8 and AC-9
  edge cases and the AC-15 repeated-expired-code case; verify with
  `cd app && npm test` (8 seeded tests stay green)
- [ ] 5.2 Re-export the discount surface from `app/src/index.ts`; verify with
  `cd app && npm run typecheck`
- [ ] 5.3 Fill in `docs/traceability.md` with an AC → code → test row for every
  criterion and complete the reverse check (code without an AC, AC without a
  test, test without an AC); verify no cell is left empty
- [ ] 5.4 Record in `docs/sdd-tool.md` what OpenSpec produced and what it did
  not; verify the file answers "what did the tool add beyond the markdown spec"
