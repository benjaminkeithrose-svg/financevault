import { taxChange } from "./incomeTax.js";
import { nswLandTax } from "./landTax.js";

/**
 * "Who should own the next property?" (IDEAS.md idea 9). The same purchase
 * modelled under each kind of owner: yearly tax and cash, NSW land tax, and
 * the tax on selling after a number of years. Owners can't be changed later
 * without stamp duty and CGT, so this is worth doing before buying.
 * Modelling for the accountant, not a decision.
 *
 * Simplified: rent, costs and interest stay at year-one levels; the sale
 * gain is value growth only (buying and selling costs, and the building
 * write-off's cost base reduction, aren't counted); a company is taxed at
 * 30% (a passive rental company isn't a base rate entity); an SMSF is in
 * accumulation (15% tax, a third off gains held over 12 months).
 */

export interface StructureInputs {
  price: number;
  rent: number;
  /** Running costs a year, not counting land tax. */
  runningCosts: number;
  loanAmount: number;
  ratePct: number;
  landValue: number;
  depreciation: number;
  growthPct: number;
  yearsHeld: number;
  residential: boolean;
  nsw: boolean;
  people: Array<{ id: string; name: string; income: number; existingNswLand: number }>;
  /** Who a family trust would distribute to (equally). */
  beneficiaryIds: string[];
}

export interface StructureOption {
  key: string;
  label: string;
  available: boolean;
  landTax: number;
  interest: number;
  taxResult: number;
  /** Positive = tax payable; negative = tax saved. */
  yearlyTax: number;
  yearlyCashAfterTax: number;
  saleGain: number;
  saleTax: number;
  /** Over the holding period: yearly cash after tax, plus the gain after tax. */
  overallAfterTax: number;
  good: string[];
  watch: string[];
  sources: string[];
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;

export function compareStructures(i: StructureInputs): StructureOption[] {
  const interest = i.loanAmount * (i.ratePct / 100);
  const gain = i.price * (Math.pow(1 + i.growthPct / 100, i.yearsHeld) - 1);
  const result = (landTax: number) => i.rent - i.runningCosts - landTax - interest - i.depreciation;
  const cash = (landTax: number) => i.rent - i.runningCosts - landTax - interest;
  const extraLandTax = (existing: number, value: number, kind: "GENERAL" | "SPECIAL_TRUST") =>
    i.nsw ? nswLandTax(existing + value, kind) - nswLandTax(existing, kind) : 0;

  const option = (o: Omit<StructureOption, "overallAfterTax" | "yearlyCashAfterTax" | "interest">): StructureOption => {
    const yearlyCashAfterTax = cash(o.landTax) - o.yearlyTax;
    return { ...o, interest, yearlyCashAfterTax, overallAfterTax: yearlyCashAfterTax * i.yearsHeld + o.saleGain - o.saleTax };
  };
  const options: StructureOption[] = [];

  // Each person on their own.
  for (const p of i.people) {
    const landTax = extraLandTax(p.existingNswLand, i.landValue, "GENERAL");
    const r = result(landTax);
    options.push(
      option({
        key: `person-${p.id}`,
        label: `${p.name} alone`,
        available: true,
        landTax,
        taxResult: r,
        yearlyTax: taxChange(p.income, r),
        saleGain: gain,
        saleTax: taxChange(p.income, gain * 0.5),
        good: [
          r < 0 ? `The loss (${money(r)}) reduces ${p.name}'s tax on their salary straight away (negative gearing).` : `Taxed at ${p.name}'s marginal rate.`,
          "50% CGT discount after 12 months.",
          "Land tax threshold available.",
        ],
        watch: ["No asset protection: the property is in their name.", "The whole gain lands in one year's tax return on sale."],
        sources: ["ATO rental expenses", "ATO guide to CGT", "Revenue NSW land tax thresholds"],
      })
    );
  }

  // Two people, half each.
  if (i.people.length >= 2) {
    const [a, b] = i.people;
    const landA = extraLandTax(a.existingNswLand, i.landValue / 2, "GENERAL");
    const landB = extraLandTax(b.existingNswLand, i.landValue / 2, "GENERAL");
    const landTax = landA + landB;
    const r = result(landTax);
    options.push(
      option({
        key: "joint",
        label: `${a.name} and ${b.name}, half each`,
        available: true,
        landTax,
        taxResult: r,
        yearlyTax: taxChange(a.income, r / 2) + taxChange(b.income, r / 2),
        saleGain: gain,
        saleTax: taxChange(a.income, (gain * 0.5) / 2) + taxChange(b.income, (gain * 0.5) / 2),
        good: ["Income, losses and the gain split 50/50 by law — each at their own rate.", "50% CGT discount."],
        watch: [
          "The split is fixed by ownership: a loss is worth more to the higher earner, a profit costs less for the lower earner.",
          "Revenue NSW assesses jointly owned land together with one threshold, so land tax may differ from this estimate.",
        ],
        sources: ["ATO rental expenses — co-owners", "Revenue NSW land tax thresholds"],
      })
    );
  }

  // Family (discretionary) trust.
  {
    const landTax = i.nsw ? nswLandTax(i.landValue, "SPECIAL_TRUST") : 0;
    const r = result(landTax);
    const bens = i.people.filter((p) => i.beneficiaryIds.includes(p.id));
    const share = bens.length ? 1 / bens.length : 0;
    const yearlyTax = r > 0 ? bens.reduce((s, b) => s + taxChange(b.income, r * share), 0) : 0;
    const saleTax = bens.reduce((s, b) => s + taxChange(b.income, gain * 0.5 * share), 0);
    options.push(
      option({
        key: "trust",
        label: "Family (discretionary) trust",
        available: bens.length > 0,
        landTax,
        taxResult: r,
        yearlyTax,
        saleGain: gain,
        saleTax,
        good: [
          "Each year's income and the eventual gain can go to whichever family members pay the least tax.",
          "50% CGT discount flows through to individual beneficiaries.",
          "Asset protection.",
        ],
        watch: [
          r < 0 ? `The loss (${money(r)} a year) is trapped in the trust — it can't reduce anyone's tax on their salary.` : "Profits must be distributed by 30 June each year.",
          "NSW land tax: a family trust gets no tax-free threshold (1.6% from the first dollar).",
          "Distributions to someone who doesn't really benefit are an ATO focus (section 100A). TR 2022/4 is under review after the High Court's Bendel decision (June 2026).",
          "Setup and yearly accounting costs; a family trust election for some tax rules.",
        ],
        sources: ["Revenue NSW — how trusts are assessed", "TR 2022/4", "PCG 2022/2"],
      })
    );
  }

  // Company.
  {
    const landTax = extraLandTax(0, i.landValue, "GENERAL");
    const r = result(landTax);
    options.push(
      option({
        key: "company",
        label: "Company",
        available: true,
        landTax,
        taxResult: r,
        yearlyTax: r > 0 ? r * 0.3 : 0,
        saleGain: gain,
        saleTax: gain * 0.3,
        good: ["A flat 30% rate — useful when everyone's marginal rate is higher.", "Asset protection."],
        watch: [
          "No 50% CGT discount — the whole gain is taxed.",
          r < 0 ? "Losses stay in the company for its future income." : "Getting money out: dividends are taxed again at the owner's rate (with franking credits); loans to shareholders fall under Division 7A.",
          "Related companies share one land tax threshold.",
        ],
        sources: ["ATO company tax rates", "Division 7A"],
      })
    );
  }

  // SMSF.
  {
    const landTax = extraLandTax(0, i.landValue, "GENERAL");
    const r = result(landTax);
    const borrowingBlocked = i.residential && i.loanAmount > 0;
    options.push(
      option({
        key: "smsf",
        label: "Self-managed super fund",
        available: !borrowingBlocked,
        landTax,
        taxResult: r,
        yearlyTax: r > 0 ? r * 0.15 : 0,
        saleGain: gain,
        saleTax: gain * (2 / 3) * 0.15,
        good: ["15% tax on rent; 10% on a gain after 12 months; nothing in pension phase.", "A commercial property can be leased to the family business at market rent."],
        watch: [
          borrowingBlocked
            ? "Not available with a loan: from 10 August 2026 new SMSF borrowing can't buy residential property."
            : "Money is locked in super until retirement; strict related-party rules — no family member can live in or rent a residential property.",
          "Contribution caps limit how much can go in to buy it.",
        ],
        sources: ["SMSFR 2012/1", "ATO new super legislation — LRBA provisions", "PCG 2016/5"],
      })
    );
  }
  return options;
}
