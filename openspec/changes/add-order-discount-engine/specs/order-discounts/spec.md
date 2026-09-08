## Purpose

Defines how an order's payable total is reduced by loyalty tier discounts and
customer-typed coupon codes: what each discount applies to, how they combine,
which coupons are honoured when several are typed, how fractions of a kopeck are
resolved, and the floor below which the total can never fall.

Scenario numbering matches the acceptance criteria in
`docs/spec/pricing-discounts.md` (AC-1 … AC-15) so that spec, tool artifacts,
code and tests all share one set of identifiers. AC-7 carries two scenarios
(threshold met and not met), so there are 16 scenarios for 15 identifiers.

## ADDED Requirements

### Requirement: Priced order breakdown

The system SHALL price an order into a breakdown that reports, separately, the
goods subtotal, the loyalty tier discount, the total coupon discount, every
applied coupon with the amount it granted, every rejected coupon with a
machine-readable reason, the shipping amount, and the payable total. All amounts
SHALL be whole kopecks. The breakdown SHALL always contain every field, using
zero rather than omission when a discount does not apply.

#### Scenario: AC-14 no tier and no coupons

- **WHEN** a customer with tier `none` and no coupon codes orders goods worth
  100 000 kopecks with 4 900 kopecks of shipping
- **THEN** the breakdown reports a tier discount of 0 and a coupon discount of 0
  as present fields, and the total equals subtotal plus shipping (104 900)

#### Scenario: AC-1 loyalty tier alone

- **WHEN** a `gold` customer orders goods worth 100 000 kopecks for domestic
  delivery and types no coupon codes
- **THEN** the tier discount is 10 000, the coupon discount is 0, shipping is
  4 900, and the total is 94 900

### Requirement: Discount base excludes shipping

The tier discount and every coupon discount SHALL be computed from the goods
subtotal only. Shipping SHALL be added after all discounts and SHALL never be
reduced by a discount.

#### Scenario: AC-6 international shipping is not discounted

- **WHEN** a `gold` customer orders goods worth 100 000 kopecks with
  international shipping of 19 900 kopecks
- **THEN** the tier discount is 10 000, shipping stays 19 900, and the total is
  109 900

### Requirement: Discounts cascade, they never add up

Discounts SHALL be applied sequentially: the tier discount reduces the goods
subtotal first, and each coupon then applies to the remaining amount. Percentage
discounts SHALL NOT be summed into a single combined percentage.

#### Scenario: AC-5 tier and order-wide coupon together

- **WHEN** a `gold` customer (10%) orders goods worth 100 000 kopecks and
  applies an order-wide 15% coupon
- **THEN** the tier discount is 10 000 and the coupon discount is 13 500 — 15%
  of the remaining 90 000, not of the original 100 000 — for a total of 81 400
  including 4 900 shipping

### Requirement: Category coupons apply to their category's share

A coupon restricted to a product category SHALL be computed from that category's
proportional share of the amount remaining after earlier discounts, not from the
whole order and not from the category's pre-discount amount.

#### Scenario: AC-10 category coupon after a tier discount

- **WHEN** a `gold` customer orders 60 000 kopecks of `fresh` goods and 40 000
  kopecks of `standard` goods, and applies a 10% coupon restricted to `fresh`
- **THEN** the coupon's base is 54 000 (the `fresh` share of the remaining
  90 000), the coupon discount is 5 400, and the total is 89 500

#### Scenario: AC-13 category absent from the order

- **WHEN** a customer applies a coupon restricted to `digital` to an order that
  contains no `digital` line, and then applies a second `digital` coupon
- **THEN** the first coupon is rejected with reason `not-applicable` and does
  not prevent the second `digital` coupon from being considered

### Requirement: At most one coupon per scope

When several coupon codes are typed, the system SHALL consider them in the order
the customer typed them and SHALL apply at most one coupon per scope, where a
scope is a product category, or the whole order for a coupon without a category.
A later coupon competing for an already-used scope SHALL be rejected with reason
`scope-occupied`. A coupon code typed more than once SHALL be counted once, the
repeat being rejected with reason `duplicate`.

#### Scenario: AC-3 two coupons on the same category

- **WHEN** a customer types a 10% `fresh` coupon and then a 20% `fresh` coupon
- **THEN** only the first is applied and the second is rejected with reason
  `scope-occupied`

#### Scenario: AC-11 the same code typed twice

- **WHEN** a customer types the same coupon code twice
- **THEN** the discount is granted once and the second occurrence is rejected
  with reason `duplicate`

#### Scenario: AC-15 the same rejected code typed twice

- **WHEN** a customer types the same expired coupon code twice
- **THEN** both occurrences are rejected with reason `expired`, and neither is
  reported as `duplicate` — only a coupon that actually granted a discount
  makes a later repeat a duplicate

### Requirement: A coupon that cannot apply is reported, not raised

A coupon that cannot be honoured SHALL NOT interrupt pricing and SHALL NOT be
dropped silently: the order SHALL still be priced, and the coupon SHALL appear
among the rejected coupons with a stable reason code — `unknown` for a code that
is not in the catalog, `expired`, `below-min-subtotal`, `scope-occupied`,
`duplicate`, or `not-applicable`. A coupon SHALL be treated as expired when the
evaluation instant is at or after its expiry instant. The evaluation instant
SHALL be accepted as an input to pricing so that a caller can price an order
against a chosen instant; when the caller supplies none, the current time
applies. Two calls made with the same effective instant SHALL produce the same
breakdown.

A typed code SHALL be matched against the catalog exactly, including letter
case. If the catalog holds more than one entry under the same code, the first
such entry SHALL win.

#### Scenario: AC-2 expired coupon

- **WHEN** a customer applies a coupon whose expiry instant is at or before the
  evaluation instant, to goods worth 100 000 kopecks
- **THEN** pricing succeeds with no coupon discount, the total is 104 900, and
  the coupon is reported as rejected with reason `expired`

#### Scenario: AC-12 unknown coupon code

- **WHEN** a customer types a code that is not in the coupon catalog
- **THEN** pricing succeeds with no coupon discount and the code is reported as
  rejected with reason `unknown`

### Requirement: Minimum subtotal is measured before discounts

A coupon's minimum-subtotal condition SHALL be evaluated against the order's
goods subtotal before any discount, so that a coupon's eligibility does not
depend on which other coupons were typed or in which order.

#### Scenario: AC-7 threshold met by the pre-discount subtotal

- **WHEN** a `gold` customer orders goods worth exactly 50 000 kopecks and
  applies a coupon requiring a minimum subtotal of 50 000
- **THEN** the coupon applies, even though only 45 000 remains after the tier
  discount

#### Scenario: AC-7 threshold not met

- **WHEN** the same order is given a coupon requiring a minimum subtotal of
  50 001
- **THEN** the coupon is rejected with reason `below-min-subtotal`

### Requirement: One half-up rounding per discount

Each discount amount SHALL be rounded to a whole kopeck exactly once, at the
moment that discount is computed, rounding a half kopeck up (in the customer's
favour). Discounts SHALL NOT be rounded per line item, and monetary arithmetic
SHALL NOT use floating-point numbers.

#### Scenario: AC-8 half a kopeck

- **WHEN** a `silver` customer (5%) orders goods worth 12 310 kopecks, so the
  exact tier discount is 615.5 kopecks
- **THEN** the tier discount is 616 kopecks and the total is 16 594

### Requirement: The total never falls below shipping

Each discount SHALL be capped at the base it applies to, and any unused
remainder of a fixed-amount coupon SHALL be forfeited rather than carried to
other goods or returned as credit. The payable total SHALL therefore never be
negative and never fall below the shipping amount.

#### Scenario: AC-4 fixed coupon larger than the order

- **WHEN** a customer applies a fixed 200 000 kopeck coupon to goods worth
  30 000 kopecks with 4 900 kopecks of shipping
- **THEN** the coupon discount is 30 000, the goods portion is 0, and the total
  is 4 900

#### Scenario: AC-9 empty order

- **WHEN** an order has no lines and the customer has typed a coupon code
- **THEN** every amount in the breakdown is 0, the total is 0, and the coupon is
  reported as rejected with reason `not-applicable`
