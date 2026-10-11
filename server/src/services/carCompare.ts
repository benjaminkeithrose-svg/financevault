import { taxChange } from "./incomeTax.js";
import { carClaim } from "./workDeductions.js";

/**
 * Car allowance vs a novated lease vs an electric car on a novated lease,
 * for one person's real numbers (IDEAS.md idea 10). Year-one cost of the car
 * to the person after tax.
 *
 * - Allowance: taxed as income; car costs paid from after-tax pay; work
 *   kilometres claimed at the cents-per-km rate (up to 5,000 km).
 * - Novated lease (petrol, diesel, hybrid): lease and running costs paid
 *   from pre-tax salary, except a post-tax "employee contribution" equal to
 *   the car's statutory taxable value (20% of its base value), which reduces
 *   the fringe benefits tax to nil (ATO, "Taxable value of a car fringe
 *   benefit"). The usual way these are set up.
 * - Electric car (zero emissions, below the luxury car tax threshold for
 *   fuel-efficient vehicles — $91,387 in 2025-26): exempt from FBT, so the
 *   whole cost can come from pre-tax salary. From 1 April 2027, new leases of
 *   electric cars over $75,000 get a 15% statutory rate instead of the
 *   exemption, and from 1 April 2029 all of them do; existing leases aren't
 *   affected. Plug-in hybrids stopped qualifying on 1 April 2025.
 *
 * Not included: GST the lease provider claims back (usually lowers a lease's
 * cost further), the reportable fringe benefit an exempt car still adds to
 * the income statement (affects the Medicare levy surcharge and HELP), and
 * the lender's view (a novated lease is a commitment and lowers the payslip
 * salary).
 */

export const STATUTORY_RATE = 0.2;

export interface CarInputs {
  fy: string;
  /** Taxable income before any car arrangement. */
  baseIncome: number;
  /** A year: finance or lease payments. */
  leasePayments: number;
  /** A year: fuel or charging, rego, insurance, servicing, tyres. */
  runningCosts: number;
  /** The car's cost including GST (its FBT base value). */
  carPrice: number;
  workKm: number;
  /** The allowance the employer would pay instead, a year. */
  allowance: number;
  /** Running costs for the electric option, if different (charging instead of fuel). */
  electricRunningCosts?: number | null;
  electricLeasePayments?: number | null;
  electricCarPrice?: number | null;
}

export interface CarOption {
  key: "ALLOWANCE" | "NOVATED" | "ELECTRIC_NOVATED";
  label: string;
  totalCosts: number;
  preTax: number;
  postTax: number;
  taxChange: number;
  /** The car's cost to the person after tax, a year (lower is better). */
  netCost: number;
  /** How much the payslip salary falls — what a lender sees. */
  salaryReduction: number;
  workings: string[];
  notes: string[];
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;

export function compareCars(i: CarInputs): CarOption[] {
  const costs = i.leasePayments + i.runningCosts;
  const km = carClaim(i.workKm, i.fy);

  // 1. Allowance: extra taxable income, less the cents-per-km deduction.
  const allowanceTax = taxChange(i.baseIncome, i.allowance - km.amount, i.fy);
  const allowance: CarOption = {
    key: "ALLOWANCE",
    label: "Car allowance",
    totalCosts: costs,
    preTax: 0,
    postTax: costs,
    taxChange: allowanceTax,
    netCost: costs - i.allowance + allowanceTax,
    salaryReduction: 0,
    workings: [
      `Car costs ${money(costs)} paid from take-home pay`,
      `Allowance ${money(i.allowance)} received, taxed as income`,
      `Work kilometres claimed: ${km.kmCounted.toLocaleString("en-AU")} km × ${Math.round(km.rate * 100)}c = ${money(km.amount)}${km.capped ? " (capped at 5,000 km)" : ""}`,
    ],
    notes: ["Keep a diary of work trips for the cents-per-km claim."],
  };

  // 2. Novated lease with the employee-contribution method.
  const contribution = Math.min(costs, i.carPrice * STATUTORY_RATE);
  const preTax = costs - contribution;
  const novatedTax = taxChange(i.baseIncome, -preTax, i.fy);
  const novated: CarOption = {
    key: "NOVATED",
    label: "Novated lease (petrol, diesel or hybrid)",
    totalCosts: costs,
    preTax,
    postTax: contribution,
    taxChange: novatedTax,
    netCost: costs + novatedTax,
    salaryReduction: preTax,
    workings: [
      `Costs ${money(costs)} a year`,
      `Paid after tax to remove the FBT: 20% of the ${money(i.carPrice)} price = ${money(contribution)}`,
      `Paid from pre-tax salary: ${money(preTax)}`,
    ],
    notes: [
      "No allowance, so no cents-per-km claim.",
      "The lease provider usually claims back GST, which lowers the cost a little more.",
    ],
  };

  // 3. Electric car, FBT-exempt: everything pre-tax.
  const eCosts = (i.electricLeasePayments ?? i.leasePayments) + (i.electricRunningCosts ?? i.runningCosts);
  const ePrice = i.electricCarPrice ?? i.carPrice;
  const electricTax = taxChange(i.baseIncome, -eCosts, i.fy);
  const electricNotes = [
    "Exempt from FBT if it's a zero-emissions car under the luxury car tax threshold for fuel-efficient cars ($91,387 in 2025-26). Plug-in hybrids no longer qualify.",
    "The exempt benefit still shows on your income statement as a reportable fringe benefit — it can affect the Medicare levy surcharge and HELP repayments.",
  ];
  if (ePrice > 75_000) {
    electricNotes.push("Over $75,000: a new lease starting from 1 April 2027 gets a 15% FBT rate instead of the full exemption. A lease that already exists isn't affected.");
  } else {
    electricNotes.push("From 1 April 2029, new leases of all electric cars get a 15% FBT rate instead of the exemption; existing leases aren't affected.");
  }
  const electric: CarOption = {
    key: "ELECTRIC_NOVATED",
    label: "Electric car on a novated lease",
    totalCosts: eCosts,
    preTax: eCosts,
    postTax: 0,
    taxChange: electricTax,
    netCost: eCosts + electricTax,
    salaryReduction: eCosts,
    workings: [`Costs ${money(eCosts)} a year, all paid from pre-tax salary (no FBT)`],
    notes: electricNotes,
  };

  return [allowance, novated, electric];
}
