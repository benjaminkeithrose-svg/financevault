/**
 * NSW transfer (stamp) duty on a purchase, from Revenue NSW's general rates
 * for 2026-27 (reference/sources/nsw-transfer-duty.pdf). Premium duty applies
 * to residential property only. First home buyer concessions and the foreign
 * purchaser surcharge aren't included. The thresholds are indexed each July,
 * so this table needs a new row set then.
 */

// [from, base duty at `from`, dollars per $100 above `from`]
const GENERAL: Array<[number, number, number]> = [
  [0, 0, 1.25],
  [18_000, 225, 1.5],
  [38_000, 525, 1.75],
  [103_000, 1_662, 3.5],
  [387_000, 11_602, 4.5],
  [1_290_000, 52_237, 5.5],
];
const PREMIUM: [number, number, number] = [3_870_000, 194_137, 7];

export const NSW_DUTY_RATES_YEAR = "2026-27";

export function nswTransferDuty(dutiableValue: number, opts: { residential?: boolean } = {}): number {
  if (!(dutiableValue > 0)) return 0;
  const bands = opts.residential ? [...GENERAL, PREMIUM] : GENERAL;
  let band = bands[0];
  for (const b of bands) if (dutiableValue > b[0]) band = b;
  const duty = band[1] + ((dutiableValue - band[0]) / 100) * band[2];
  return Math.max(20, Math.round(duty));
}
