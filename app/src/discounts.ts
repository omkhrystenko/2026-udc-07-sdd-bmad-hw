// Discount engine. Implements docs/spec/pricing-discounts.md — every decision
// below carries the D-N id of the spec row that fixed it, and every behaviour
// is pinned by an AC-N test in discounts.test.ts.
//
// All amounts are whole kopecks. There is no floating-point arithmetic here on
// purpose: every division goes through roundHalfUp (D-4).

import type { Coupon, LineItem, Order } from "./types.js";
import { lineTotalKopecks, shippingKopecks, subtotalKopecks, tierPercent } from "./pricing.js";

export type CouponRejectionReason =
  | "unknown" // D-9:  no such code in the catalog
  | "expired" // D-8:  now >= expiresAt
  | "below-min-subtotal" // D-6:  pre-discount subtotal is under the threshold
  | "scope-occupied" // D-3:  a coupon already used this scope
  | "duplicate" // D-10: this code was already counted
  | "not-applicable"; // D-11: the scope base is 0 (category absent / empty cart)

export interface AppliedCoupon {
  code: string;
  /** The discount actually granted, after the D-7/D-12 cap. */
  discountKopecks: number;
}

export interface RejectedCoupon {
  code: string;
  reason: CouponRejectionReason;
}

export interface PriceBreakdown {
  subtotalKopecks: number;
  tierDiscountKopecks: number;
  /** Sum of the discounts granted by every applied coupon. */
  couponDiscountKopecks: number;
  appliedCoupons: AppliedCoupon[];
  rejectedCoupons: RejectedCoupon[];
  shippingKopecks: number;
  /** subtotal − tierDiscount − couponDiscount + shipping; never negative. */
  totalKopecks: number;
}

/** The whole order, used as a scope key for coupons without a category (D-3). */
const ORDER_SCOPE = "order";

/**
 * Integer half-up rounding of `numerator / denominator` (D-4). Written as
 * (2n + d) / 2d rather than (n + d/2) / d because the denominator is not
 * always even — for a category coupon it is the goods subtotal (D-5).
 */
function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

function categorySubtotalKopecks(order: Order, category: LineItem["category"]): number {
  return order.items
    .filter((item) => item.category === category)
    .reduce((sum, item) => sum + lineTotalKopecks(item), 0);
}

/**
 * The amount a coupon may discount: the whole remainder for an order-wide
 * coupon, or the category's proportional share of it (D-5).
 */
function scopeBaseKopecks(
  coupon: Coupon,
  order: Order,
  goodsSubtotal: number,
  remaining: number,
): number {
  if (coupon.category === undefined) return remaining;
  if (goodsSubtotal === 0) return 0;
  return roundHalfUp(remaining * categorySubtotalKopecks(order, coupon.category), goodsSubtotal);
}

function rawDiscountKopecks(coupon: Coupon, scopeBase: number): number {
  return coupon.kind === "percent" ? roundHalfUp(scopeBase * coupon.value, 100) : coupon.value;
}

/**
 * Prices an order: loyalty tier first, then coupons on the remainder (D-1),
 * with shipping added afterwards and never discounted (D-2).
 *
 * @param order   the order; `order.coupons` holds codes in the order the
 *                customer typed them, and that order is what applies (D-15)
 * @param catalog coupon definitions; the order they come in does not matter
 * @param now     the instant expiry is judged against (D-13)
 */
export function priceOrder(order: Order, catalog: Coupon[], now: Date = new Date()): PriceBreakdown {
  const goodsSubtotal = subtotalKopecks(order);
  const tierDiscount = roundHalfUp(goodsSubtotal * tierPercent(order), 100);

  let remaining = goodsSubtotal - tierDiscount;
  const applied: AppliedCoupon[] = [];
  const rejected: RejectedCoupon[] = [];
  const occupiedScopes = new Set<string>();
  // A code counts as "seen" only once it has actually granted a discount, so a
  // repeated code that was itself rejected keeps its real reason (D-10, AC-15).
  const seenCodes = new Set<string>();

  for (const code of order.coupons) {
    const coupon = catalog.find((candidate) => candidate.code === code);
    if (coupon === undefined) {
      rejected.push({ code, reason: "unknown" }); // D-9
      continue;
    }
    if (seenCodes.has(code)) {
      rejected.push({ code, reason: "duplicate" }); // D-10
      continue;
    }
    if (now.getTime() >= new Date(coupon.expiresAt).getTime()) {
      rejected.push({ code, reason: "expired" }); // D-8, D-13
      continue;
    }
    if (coupon.minSubtotalKopecks !== undefined && goodsSubtotal < coupon.minSubtotalKopecks) {
      rejected.push({ code, reason: "below-min-subtotal" }); // D-6
      continue;
    }

    const scopeBase = scopeBaseKopecks(coupon, order, goodsSubtotal, remaining);
    // Checked before occupancy on purpose: a coupon that grants nothing must
    // not block a later coupon on the same scope (D-11).
    if (scopeBase === 0) {
      rejected.push({ code, reason: "not-applicable" });
      continue;
    }

    const scope = coupon.category ?? ORDER_SCOPE;
    if (occupiedScopes.has(scope)) {
      rejected.push({ code, reason: "scope-occupied" }); // D-3
      continue;
    }

    const discount = Math.min(rawDiscountKopecks(coupon, scopeBase), scopeBase); // D-7, D-12
    remaining -= discount;
    occupiedScopes.add(scope);
    seenCodes.add(code);
    applied.push({ code, discountKopecks: discount });
  }

  const couponDiscount = applied.reduce((sum, entry) => sum + entry.discountKopecks, 0);
  const shipping = shippingKopecks(order);

  return {
    subtotalKopecks: goodsSubtotal,
    tierDiscountKopecks: tierDiscount,
    couponDiscountKopecks: couponDiscount,
    appliedCoupons: applied,
    rejectedCoupons: rejected,
    shippingKopecks: shipping,
    totalKopecks: remaining + shipping,
  };
}
