// One test per acceptance criterion in docs/spec/pricing-discounts.md §4.
// Test names carry the AC id so the spec link is visible in the vitest output.

import { describe, it, expect } from "vitest";
import { priceOrder } from "./discounts.js";
import type { Coupon, LineItem, Order } from "./types.js";

const NOW = new Date("2026-09-08T12:00:00.000Z");
const FUTURE = "2026-12-31T00:00:00.000Z";

const item = (over: Partial<LineItem> = {}): LineItem => ({
  sku: "AA-1",
  name: "Thing",
  unitPriceKopecks: 100_000,
  quantity: 1,
  category: "standard",
  ...over,
});

const order = (over: Partial<Order> = {}): Order => ({
  id: "o1",
  items: [item()],
  country: "UA",
  customerTier: "none",
  coupons: [],
  ...over,
});

const coupon = (over: Partial<Coupon> = {}): Coupon => ({
  code: "AUTUMN",
  kind: "percent",
  value: 15,
  expiresAt: FUTURE,
  ...over,
});

describe("priceOrder", () => {
  it("AC-1: gold tier alone discounts 10% of the goods", () => {
    const result = priceOrder(order({ customerTier: "gold" }), [], NOW);

    expect(result.subtotalKopecks).toBe(100_000);
    expect(result.tierDiscountKopecks).toBe(10_000);
    expect(result.couponDiscountKopecks).toBe(0);
    expect(result.shippingKopecks).toBe(4_900);
    expect(result.totalKopecks).toBe(94_900);
  });

  it("AC-2: an expired coupon is rejected, not applied and not thrown", () => {
    const expired = coupon({ code: "SUMMER", expiresAt: "2026-09-01T00:00:00.000Z" });
    const result = priceOrder(order({ coupons: ["SUMMER"] }), [expired], NOW);

    expect(result.couponDiscountKopecks).toBe(0);
    expect(result.appliedCoupons).toEqual([]);
    expect(result.rejectedCoupons).toEqual([{ code: "SUMMER", reason: "expired" }]);
    expect(result.totalKopecks).toBe(104_900);
  });

  it("AC-3: of two coupons on one category only the first typed applies", () => {
    const o = order({
      items: [item({ category: "fresh" })],
      coupons: ["FRESH10", "FRESH20"],
    });
    // Catalog order is deliberately the reverse of the typing order: the test
    // must prove that the customer's order wins, not the catalog's (D-15).
    const catalog = [
      coupon({ code: "FRESH20", value: 20, category: "fresh" }),
      coupon({ code: "FRESH10", value: 10, category: "fresh" }),
    ];

    const result = priceOrder(o, catalog, NOW);

    expect(result.appliedCoupons).toEqual([{ code: "FRESH10", discountKopecks: 10_000 }]);
    expect(result.rejectedCoupons).toEqual([{ code: "FRESH20", reason: "scope-occupied" }]);
  });

  it("AC-4: a fixed coupon larger than the order leaves shipping only, never a negative total", () => {
    const o = order({ items: [item({ unitPriceKopecks: 30_000 })], coupons: ["BIG"] });
    const big = coupon({ code: "BIG", kind: "fixed", value: 200_000 });

    const result = priceOrder(o, [big], NOW);

    expect(result.couponDiscountKopecks).toBe(30_000);
    expect(result.totalKopecks).toBe(4_900);
    expect(result.appliedCoupons).toEqual([{ code: "BIG", discountKopecks: 30_000 }]);
  });

  it("AC-5: tier and coupon cascade, they do not add up to 25%", () => {
    const o = order({ customerTier: "gold", coupons: ["AUTUMN"] });

    const result = priceOrder(o, [coupon()], NOW);

    expect(result.tierDiscountKopecks).toBe(10_000);
    expect(result.couponDiscountKopecks).toBe(13_500); // 15% of the remaining 90 000
    expect(result.totalKopecks).toBe(81_400);
  });

  it("AC-6: shipping is added after discounts and never discounted", () => {
    const result = priceOrder(order({ customerTier: "gold", country: "PL" }), [], NOW);

    expect(result.tierDiscountKopecks).toBe(10_000);
    expect(result.shippingKopecks).toBe(19_900);
    expect(result.totalKopecks).toBe(109_900);
  });

  it("AC-7: the minimum subtotal is judged before discounts, not after", () => {
    const o = order({
      items: [item({ unitPriceKopecks: 50_000 })],
      customerTier: "gold",
      coupons: ["MIN500"],
    });

    const met = priceOrder(o, [coupon({ code: "MIN500", minSubtotalKopecks: 50_000 })], NOW);
    expect(met.appliedCoupons).toEqual([{ code: "MIN500", discountKopecks: 6_750 }]);

    const notMet = priceOrder(o, [coupon({ code: "MIN500", minSubtotalKopecks: 50_001 })], NOW);
    expect(notMet.rejectedCoupons).toEqual([{ code: "MIN500", reason: "below-min-subtotal" }]);
    expect(notMet.couponDiscountKopecks).toBe(0);
  });

  it("AC-8: half a kopeck rounds up, in the customer's favour", () => {
    const o = order({ items: [item({ unitPriceKopecks: 12_310 })], customerTier: "silver" });

    const result = priceOrder(o, [], NOW);

    expect(result.tierDiscountKopecks).toBe(616); // exactly 615.5
    expect(result.totalKopecks).toBe(16_594);
  });

  it("AC-9: an empty order prices to zero and rejects the coupon", () => {
    const result = priceOrder(order({ items: [], coupons: ["AUTUMN"] }), [coupon()], NOW);

    expect(result.subtotalKopecks).toBe(0);
    expect(result.tierDiscountKopecks).toBe(0);
    expect(result.couponDiscountKopecks).toBe(0);
    expect(result.shippingKopecks).toBe(0);
    expect(result.totalKopecks).toBe(0);
    expect(result.rejectedCoupons).toEqual([{ code: "AUTUMN", reason: "not-applicable" }]);
  });

  it("AC-10: a category coupon takes that category's share of the remainder", () => {
    const o = order({
      items: [
        item({ sku: "F-1", unitPriceKopecks: 60_000, category: "fresh" }),
        item({ sku: "S-1", unitPriceKopecks: 40_000, category: "standard" }),
      ],
      customerTier: "gold",
      coupons: ["FRESH10"],
    });

    const result = priceOrder(o, [coupon({ code: "FRESH10", value: 10, category: "fresh" })], NOW);

    // fresh share of the remaining 90 000 is 54 000; 10% of that is 5 400
    expect(result.couponDiscountKopecks).toBe(5_400);
    expect(result.totalKopecks).toBe(89_500);
  });

  it("AC-11: the same code typed twice is counted once", () => {
    const o = order({ coupons: ["AUTUMN", "AUTUMN"] });

    const result = priceOrder(o, [coupon()], NOW);

    expect(result.appliedCoupons).toEqual([{ code: "AUTUMN", discountKopecks: 15_000 }]);
    expect(result.rejectedCoupons).toEqual([{ code: "AUTUMN", reason: "duplicate" }]);
    expect(result.couponDiscountKopecks).toBe(15_000);
  });

  it("AC-12: a code missing from the catalog is rejected as unknown", () => {
    const result = priceOrder(order({ coupons: ["TYPO"] }), [coupon()], NOW);

    expect(result.couponDiscountKopecks).toBe(0);
    expect(result.rejectedCoupons).toEqual([{ code: "TYPO", reason: "unknown" }]);
    expect(result.totalKopecks).toBe(104_900);
  });

  it("AC-13: a coupon for an absent category does not occupy that scope", () => {
    const o = order({ coupons: ["DIG10", "DIG20"] });
    const catalog = [
      coupon({ code: "DIG10", value: 10, category: "digital" }),
      coupon({ code: "DIG20", value: 20, category: "digital" }),
    ];

    const result = priceOrder(o, catalog, NOW);

    expect(result.rejectedCoupons).toEqual([
      { code: "DIG10", reason: "not-applicable" },
      { code: "DIG20", reason: "not-applicable" },
    ]);
    expect(result.appliedCoupons).toEqual([]);
  });

  it("AC-15: an expired code typed twice is expired twice, never a duplicate", () => {
    const expired = coupon({ code: "SUMMER", expiresAt: "2026-09-01T00:00:00.000Z" });
    const o = order({ coupons: ["SUMMER", "SUMMER"] });

    const result = priceOrder(o, [expired], NOW);

    expect(result.rejectedCoupons).toEqual([
      { code: "SUMMER", reason: "expired" },
      { code: "SUMMER", reason: "expired" },
    ]);
    expect(result.appliedCoupons).toEqual([]);
  });

  it("AC-14: without a tier or coupons the breakdown still carries both zeros", () => {
    const result = priceOrder(order(), [], NOW);

    expect(result.tierDiscountKopecks).toBe(0);
    expect(result.couponDiscountKopecks).toBe(0);
    expect(result.subtotalKopecks + result.shippingKopecks).toBe(result.totalKopecks);
  });
});
