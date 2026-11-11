/**
 * Capital gains calculations for Australian investors.
 *
 * These are arithmetic on records the user entered, not tax advice. Anything
 * derived here is labelled as calculated and is meant to be handed to an
 * accountant, never lodged from directly.
 */

export interface ParcelLike {
  id: string;
  acquisitionDate: Date;
  quantity: number;
  unitPrice: number;
  brokerage: number;
}

export interface AllocationLike {
  parcelId: string;
  quantity: number;
}

/**
 * What the parcel cost, all in. Brokerage on the way in forms part of the
 * cost base, which is why it's captured per parcel rather than lumped
 * somewhere it can't be attributed.
 */
export function parcelCostBase(parcel: ParcelLike): number {
  return parcel.quantity * parcel.unitPrice + parcel.brokerage;
}

export function parcelUnitCostBase(parcel: ParcelLike): number {
  return parcel.quantity === 0 ? 0 : parcelCostBase(parcel) / parcel.quantity;
}

export function remainingQuantity(parcel: ParcelLike, allocations: AllocationLike[]): number {
  const used = allocations.filter((a) => a.parcelId === parcel.id).reduce((s, a) => s + a.quantity, 0);
  return parcel.quantity - used;
}

/**
 * The CGT discount an entity gets on a gain from an asset held long enough.
 * Companies get none, super funds get a third, everyone else half.
 */
export function discountRateFor(entityType: string): number {
  switch (entityType) {
    case "COMPANY":
      return 0;
    case "SUPER_FUND":
    case "SMSF":
      return 1 / 3;
    default:
      return 0.5;
  }
}

/**
 * The discount needs the asset held for at least 12 months, and the day of
 * acquisition doesn't count — so a parcel bought on 1 July and sold on
 * 1 July the following year does NOT qualify; it needs one more day.
 */
export function isDiscountEligible(acquisitionDate: Date, disposalDate: Date): boolean {
  const twelveMonthsOn = new Date(acquisitionDate);
  twelveMonthsOn.setFullYear(twelveMonthsOn.getFullYear() + 1);
  return disposalDate.getTime() > twelveMonthsOn.getTime();
}

export interface DisposalLike {
  disposalDate: Date;
  quantity: number;
  unitPrice: number;
  brokerage: number;
}

export interface AllocationResult {
  parcelId: string;
  quantity: number;
  acquisitionDate: Date;
  costBase: number;
  proceeds: number;
  /** Before any discount — the raw gain or loss. */
  grossGain: number;
  discountEligible: boolean;
  discountAmount: number;
  /** What actually goes into the return for this slice. */
  netGain: number;
}

export interface DisposalResult {
  proceeds: number;
  costBase: number;
  grossGain: number;
  discountAmount: number;
  netGain: number;
  allocations: AllocationResult[];
  /** Quantity the allocations don't cover — a data problem, surfaced not hidden. */
  unallocatedQuantity: number;
}

/**
 * Works out the gain on one disposal from the parcels it drew on.
 *
 * Proceeds are net of selling brokerage and split across parcels in
 * proportion to the quantity each contributed; cost base comes from each
 * parcel's own unit cost. Discount eligibility is decided per parcel, since
 * that is how the 12-month rule actually works — one sale can be part
 * discounted and part not.
 */
export function computeDisposal(
  disposal: DisposalLike,
  allocations: AllocationLike[],
  parcelsById: Map<string, ParcelLike>,
  entityType: string
): DisposalResult {
  const totalProceeds = disposal.quantity * disposal.unitPrice - disposal.brokerage;
  const allocatedQuantity = allocations.reduce((s, a) => s + a.quantity, 0);
  const discountRate = discountRateFor(entityType);

  const results: AllocationResult[] = [];
  for (const allocation of allocations) {
    const parcel = parcelsById.get(allocation.parcelId);
    if (!parcel) continue;

    const costBase = parcelUnitCostBase(parcel) * allocation.quantity;
    const proceeds = disposal.quantity === 0 ? 0 : totalProceeds * (allocation.quantity / disposal.quantity);
    const grossGain = proceeds - costBase;

    // A loss is never discounted — the discount only ever reduces a gain.
    const discountEligible = grossGain > 0 && isDiscountEligible(parcel.acquisitionDate, disposal.disposalDate);
    const discountAmount = discountEligible ? grossGain * discountRate : 0;

    results.push({
      parcelId: parcel.id,
      quantity: allocation.quantity,
      acquisitionDate: parcel.acquisitionDate,
      costBase,
      proceeds,
      grossGain,
      discountEligible,
      discountAmount,
      netGain: grossGain - discountAmount,
    });
  }

  return {
    proceeds: totalProceeds,
    costBase: results.reduce((s, r) => s + r.costBase, 0),
    grossGain: results.reduce((s, r) => s + r.grossGain, 0),
    discountAmount: results.reduce((s, r) => s + r.discountAmount, 0),
    netGain: results.reduce((s, r) => s + r.netGain, 0),
    allocations: results,
    unallocatedQuantity: disposal.quantity - allocatedQuantity,
  };
}

/**
 * Proposes which parcels a sale should come out of, oldest first.
 *
 * FIFO is the common default, but it is not always the best outcome — selling
 * a newer parcel can realise a smaller gain, while an older one may qualify
 * for the discount. This only ever proposes; the user can nominate parcels
 * themselves, which is what the SPECIFIC method records.
 */
export function allocateFifo(
  parcels: ParcelLike[],
  existingAllocations: AllocationLike[],
  quantityToSell: number
): AllocationLike[] {
  const available = parcels
    .map((p) => ({ parcel: p, remaining: remainingQuantity(p, existingAllocations) }))
    .filter((p) => p.remaining > 0)
    .sort((a, b) => a.parcel.acquisitionDate.getTime() - b.parcel.acquisitionDate.getTime());

  const allocations: AllocationLike[] = [];
  let outstanding = quantityToSell;
  for (const { parcel, remaining } of available) {
    if (outstanding <= 0) break;
    const take = Math.min(remaining, outstanding);
    allocations.push({ parcelId: parcel.id, quantity: take });
    outstanding -= take;
  }
  return allocations;
}

export interface PositionInput {
  securityId: string;
  parcels: ParcelLike[];
  allocations: AllocationLike[];
  latestPrice: number | null;
  priceDate: Date | null;
}

export interface Position {
  securityId: string;
  quantity: number;
  costBase: number;
  averageUnitCost: number;
  latestPrice: number | null;
  priceDate: Date | null;
  marketValue: number | null;
  unrealisedGain: number | null;
  /** How much of the holding would attract the discount if sold today. */
  discountEligibleQuantity: number;
}

/**
 * The current position in one security: what's still held after disposals,
 * what it cost, and — only where a price is actually known — what it's worth.
 * Market value stays null rather than falling back to cost, so a missing
 * price is visible instead of quietly reading as a zero gain.
 */
export function computePosition(input: PositionInput, asAt: Date = new Date()): Position {
  let quantity = 0;
  let costBase = 0;
  let discountEligibleQuantity = 0;

  for (const parcel of input.parcels) {
    const remaining = remainingQuantity(parcel, input.allocations);
    if (remaining <= 0) continue;
    quantity += remaining;
    costBase += parcelUnitCostBase(parcel) * remaining;
    if (isDiscountEligible(parcel.acquisitionDate, asAt)) discountEligibleQuantity += remaining;
  }

  const marketValue = input.latestPrice === null ? null : quantity * input.latestPrice;

  return {
    securityId: input.securityId,
    quantity,
    costBase,
    averageUnitCost: quantity === 0 ? 0 : costBase / quantity,
    latestPrice: input.latestPrice,
    priceDate: input.priceDate,
    marketValue,
    unrealisedGain: marketValue === null ? null : marketValue - costBase,
    discountEligibleQuantity,
  };
}

export interface GainPart {
  /** Gain (positive) or loss (negative) on one parcel slice of a sale. */
  grossGain: number;
  /** Whether a gain on this slice qualifies for the discount (held 12+ months). */
  discountEligible: boolean;
}

export interface NetCapitalGainResult {
  totalGains: number;
  totalLosses: number;
  lossesApplied: number;
  discountAmount: number;
  netCapitalGain: number;
  /** Losses left over once every gain is used up — carried to a later year. */
  lossCarriedForward: number;
}

/**
 * One entity's net capital gain for a year, the way the return works it out:
 * capital losses come off gains FIRST, and the discount only applies to
 * what's left. Discounting each sale and then subtracting losses gets a
 * different (lower) answer whenever there's a loss in the year.
 *
 * Losses are applied to gains that don't get the discount before gains that
 * do. The ATO lets you choose the order, and this one leaves the most gain
 * eligible for the discount — so it produces the lowest net gain.
 *
 * Only one entity's sales may be passed in: losses of one taxpayer can't
 * offset another's gains.
 */
export function netCapitalGain(parts: GainPart[], discountRate: number): NetCapitalGainResult {
  let discountable = 0;
  let nonDiscountable = 0;
  let losses = 0;
  for (const part of parts) {
    if (part.grossGain < 0) losses += -part.grossGain;
    else if (part.discountEligible) discountable += part.grossGain;
    else nonDiscountable += part.grossGain;
  }

  const againstNonDiscountable = Math.min(losses, nonDiscountable);
  let lossLeft = losses - againstNonDiscountable;
  const againstDiscountable = Math.min(lossLeft, discountable);
  lossLeft -= againstDiscountable;

  const discountBase = discountable - againstDiscountable;
  const discountAmount = discountBase * discountRate;

  return {
    totalGains: discountable + nonDiscountable,
    totalLosses: losses,
    lossesApplied: againstNonDiscountable + againstDiscountable,
    discountAmount,
    netCapitalGain: nonDiscountable - againstNonDiscountable + discountBase - discountAmount,
    lossCarriedForward: lossLeft,
  };
}
