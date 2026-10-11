import { describe, expect, it } from "vitest";
import {
  allocateFifo,
  computeDisposal,
  computePosition,
  discountRateFor,
  isDiscountEligible,
  netCapitalGain,
  parcelCostBase,
  type ParcelLike,
} from "../src/services/cgt.js";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const parcel = (id: string, date: string, quantity: number, unitPrice: number, brokerage = 0): ParcelLike => ({
  id,
  acquisitionDate: d(date),
  quantity,
  unitPrice,
  brokerage,
});

describe("12-month CGT discount test", () => {
  it("does not qualify at exactly twelve months — the acquisition day doesn't count", () => {
    expect(isDiscountEligible(d("2023-07-01"), d("2024-07-01"))).toBe(false);
  });
  it("qualifies one day later", () => {
    expect(isDiscountEligible(d("2023-07-01"), d("2024-07-02"))).toBe(true);
  });
  it("does not qualify inside twelve months", () => {
    expect(isDiscountEligible(d("2023-07-01"), d("2024-06-30"))).toBe(false);
  });
});

describe("discount rate by owning entity", () => {
  it.each([
    ["INDIVIDUAL", 0.5],
    ["JOINT", 0.5],
    ["TRUST", 0.5],
    ["SUPER_FUND", 1 / 3],
    ["SMSF", 1 / 3],
    ["COMPANY", 0],
  ])("%s gets %d", (entityType, rate) => {
    expect(discountRateFor(entityType)).toBeCloseTo(rate);
  });
});

describe("cost base", () => {
  it("includes purchase brokerage", () => {
    expect(parcelCostBase(parcel("p", "2021-01-01", 100, 95, 30))).toBe(9530);
  });
});

describe("a sale spanning two parcels", () => {
  // 100 bought in 2021, 50 bought in late 2024; sell 120 in March 2025.
  const parcels = [parcel("old", "2021-03-15", 100, 95, 30), parcel("new", "2024-09-01", 50, 101, 10)];
  const byId = new Map(parcels.map((p) => [p.id, p]));
  const sale = { disposalDate: d("2025-03-01"), quantity: 120, unitPrice: 130, brokerage: 20 };

  it("draws oldest parcels first", () => {
    expect(allocateFifo(parcels, [], 120)).toEqual([
      { parcelId: "old", quantity: 100 },
      { parcelId: "new", quantity: 20 },
    ]);
  });

  it("discounts only the parcel held over a year", () => {
    const result = computeDisposal(sale, allocateFifo(parcels, [], 120), byId, "INDIVIDUAL");
    expect(result.proceeds).toBeCloseTo(15_580); // 120 × 130 − 20
    expect(result.costBase).toBeCloseTo(11_554); // 100 × 95.30 + 20 × 101.20
    expect(result.grossGain).toBeCloseTo(4_026);

    const [older, newer] = result.allocations;
    expect(older.discountEligible).toBe(true);
    expect(older.grossGain).toBeCloseTo(3_453.33, 2);
    expect(newer.discountEligible).toBe(false);
    expect(newer.grossGain).toBeCloseTo(572.67, 2);

    expect(result.discountAmount).toBeCloseTo(1_726.67, 2); // half of the older slice only
    expect(result.netGain).toBeCloseTo(2_299.33, 2);
  });

  it("applies a third for a super fund", () => {
    const result = computeDisposal(
      { disposalDate: d("2025-03-01"), quantity: 100, unitPrice: 130, brokerage: 0 },
      [{ parcelId: "old", quantity: 100 }],
      byId,
      "SMSF"
    );
    expect(result.grossGain).toBeCloseTo(3_470);
    expect(result.discountAmount).toBeCloseTo(1_156.67, 2);
  });

  it("gives a company no discount", () => {
    const result = computeDisposal(sale, allocateFifo(parcels, [], 120), byId, "COMPANY");
    expect(result.discountAmount).toBe(0);
    expect(result.netGain).toBeCloseTo(result.grossGain);
  });

  it("scales with quantity — the bug the old report had", () => {
    const one = computeDisposal({ ...sale, quantity: 1, brokerage: 0 }, [{ parcelId: "old", quantity: 1 }], byId, "COMPANY");
    const hundred = computeDisposal({ ...sale, quantity: 100, brokerage: 0 }, [{ parcelId: "old", quantity: 100 }], byId, "COMPANY");
    expect(hundred.grossGain).toBeCloseTo(one.grossGain * 100);
  });

  it("reports quantity it couldn't allocate rather than inventing a cost base", () => {
    const result = computeDisposal(sale, [{ parcelId: "old", quantity: 100 }], byId, "INDIVIDUAL");
    expect(result.unallocatedQuantity).toBe(20);
  });
});

describe("losses", () => {
  it("are never discounted, even when held for years", () => {
    const p = parcel("p", "2015-01-01", 100, 50);
    const result = computeDisposal(
      { disposalDate: d("2025-01-01"), quantity: 100, unitPrice: 30, brokerage: 0 },
      [{ parcelId: "p", quantity: 100 }],
      new Map([["p", p]]),
      "INDIVIDUAL"
    );
    expect(result.grossGain).toBe(-2_000);
    expect(result.discountAmount).toBe(0);
    expect(result.netGain).toBe(-2_000);
  });
});

describe("FIFO allocation", () => {
  it("skips parcels already sold from", () => {
    const parcels = [parcel("a", "2020-01-01", 10, 1), parcel("b", "2021-01-01", 10, 1)];
    expect(allocateFifo(parcels, [{ parcelId: "a", quantity: 10 }], 5)).toEqual([{ parcelId: "b", quantity: 5 }]);
  });

  it("allocates only what's held when asked for more", () => {
    const allocations = allocateFifo([parcel("a", "2020-01-01", 10, 1)], [], 25);
    expect(allocations.reduce((s, a) => s + a.quantity, 0)).toBe(10);
  });
});

describe("positions", () => {
  const parcels = [parcel("old", "2021-03-15", 100, 95, 30), parcel("new", "2024-09-01", 50, 101, 10)];
  const sold = [
    { parcelId: "old", quantity: 100 },
    { parcelId: "new", quantity: 20 },
  ];

  it("values what's left at the latest price", () => {
    const pos = computePosition(
      { securityId: "cba", parcels, allocations: sold, latestPrice: 135, priceDate: d("2025-06-01") },
      d("2025-06-01")
    );
    expect(pos.quantity).toBe(30);
    expect(pos.costBase).toBeCloseTo(3_036);
    expect(pos.marketValue).toBeCloseTo(4_050);
    expect(pos.unrealisedGain).toBeCloseTo(1_014);
    expect(pos.discountEligibleQuantity).toBe(0);
  });

  it("leaves value unknown without a price, rather than reading as a zero gain", () => {
    const pos = computePosition({ securityId: "x", parcels, allocations: sold, latestPrice: null, priceDate: null });
    expect(pos.marketValue).toBeNull();
    expect(pos.unrealisedGain).toBeNull();
  });
});

describe("net capital gain for a year", () => {
  it("applies losses before the discount", () => {
    const result = netCapitalGain(
      [
        { grossGain: 10_000, discountEligible: true },
        { grossGain: -4_000, discountEligible: false },
      ],
      0.5
    );
    expect(result.netCapitalGain).toBe(3_000);
    expect(result.discountAmount).toBe(3_000);
  });

  it("uses losses on non-discountable gains first", () => {
    const result = netCapitalGain(
      [
        { grossGain: 10_000, discountEligible: true },
        { grossGain: 2_000, discountEligible: false },
        { grossGain: -3_000, discountEligible: false },
      ],
      0.5
    );
    // 2,000 short-term gain wiped out, 1,000 left against the 10,000.
    expect(result.netCapitalGain).toBe(4_500);
  });

  it("carries forward losses bigger than the year's gains, and never goes negative", () => {
    const result = netCapitalGain(
      [
        { grossGain: 1_000, discountEligible: true },
        { grossGain: -5_000, discountEligible: false },
      ],
      0.5
    );
    expect(result.netCapitalGain).toBe(0);
    expect(result.lossCarriedForward).toBe(4_000);
  });

  it("applies the super fund's one-third discount", () => {
    expect(netCapitalGain([{ grossGain: 900, discountEligible: true }], discountRateFor("SMSF")).netCapitalGain).toBeCloseTo(600);
  });
});
