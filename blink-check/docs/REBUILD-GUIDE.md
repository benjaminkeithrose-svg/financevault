# Blink Check — rebuild guide

This guide explains how Blink Check works and how it's built, in enough detail for a person or an AI assistant (such as Claude) to rebuild it, change it, or move it somewhere else. You don't need the original conversation, code or developer to do this.

If you're an AI assistant reading this, the code is the source of truth. Use this guide to understand it, and keep the guide up to date when you change the code. Read section 14 ("Rules to keep") before you change anything.

---

## 1. What it is

Blink Check is a quick check, or "blink", on one question: **is the next move worth researching properly, or are we better off leaving the cash in the home loan offset?**

- **Who it's for:** an ordinary Australian household (one or two people) that owns a home and maybe a rental or two, and is thinking about what to do next. Examples are buying another residential or commercial property, buying through an SMSF, selling, buying shares or debt recycling.
- **What it gives them:**
  - a verdict for each plan, compared with doing nothing new;
  - charts with the plans overlaid;
  - how much of their own money each plan needs, every year;
  - where the money for each purchase comes from;
  - a summary in plain words they can send to an accountant or broker.
- **What it isn't:** advice. It gives broad estimates to decide what's worth taking to a professional.

### Design goals (from the person who asked for it)

1. **Simple to use, sophisticated underneath.** It has five short pages and works well on a phone. Amounts can be spoken with the phone's microphone ("six hundred and fifty thousand").
2. **The yardstick is the offset.** Every plan is compared with keeping cash in the home loan offset, because that's the safe, tax-free return any plan has to beat.
3. **It looks 10 to 30 years ahead (20 by default)** and follows 2–3 properties deep, for example buy now, buy again in year 7–8, and sell or consolidate in year 10.
4. **Rates move.** Interest rates rise and fall the way the RBA cash rate did since 2000, starting from today's rates.
5. **It covers P&I and interest-only loans, and an offset on every loan.** The offset shortens the loan: $100k in the offset of a $400k, 30-year loan pays it off in about 16–17 years.
6. **Tax is counted, cautiously.** This means negative gearing, building and fittings write-offs, CGT with the discount, franking credits, land tax and stamp duty, with conservative figures.
7. **Lenders' rules are counted.** Credit card limits and personal loans count against borrowing, the way a lender would count them.
8. **It's very clear about money in and out.** It shows how much extra cash the household puts in each year. When an investment makes money, it shows where that money goes: its own offset, the home loan offset, paying debt down, or savings.
9. **It's one HTML file that works offline.** Figures are saved into the file itself, so it can be kept, emailed to an accountant or broker, or opened fresh to start again. Nothing is uploaded or published.
10. **It explains itself.** A "?" button sits beside every non-obvious box, and there's a Help page with a glossary (offset, LVR, cap rate, WALE, negative gearing and more).

---

## 2. Files

```
blink-check/
  README.md               short overview for people
  docs/REBUILD-GUIDE.md   this guide (also built into the page — see section 11)
  src/engine.js           all the money working-out: pure functions, no page code
  src/app.js              the page: state, five pages + Help, charts, saving, events
  src/head.html           <title>, fonts, all CSS (light and dark)
  src/body.html           the page skeleton: header, tabs, page sections, footer,
                          the saved-figures and rebuild-guide script tags
  build.mjs               joins everything into one file
  test/engine.test.mjs    engine tests (Node's built-in test runner)
  dist/blink-check.html   the built file to keep and send (Save a copy works here)
  dist/artifact.html      the same page without <html>/<head> wrappers, for hosts
                          that add their own (e.g. a claude.ai artifact)
```

### Commands

These need Node 18 or later. Nothing to install: there are no dependencies.

```
node blink-check/build.mjs                      # builds dist/
node --test blink-check/test/engine.test.mjs    # runs the engine tests
```

To use it, open `dist/blink-check.html` in any modern browser.

### Libraries

There are none, on purpose:
- the charts are hand-drawn SVG;
- the only outside request is Google Fonts (Inter and Space Grotesk), which falls back to system fonts offline.

This keeps the file small (about 150 KB), private, and working for years without updates.

---

## 3. The data (one JSON object)

Everything the person enters is one plain object, called `state` in `app.js` and `plan` in `engine.js`. The engine reads exactly this object. The page saves exactly this object.

```js
{
  people: [{ id, name, salary, super }],          // 1 or 2 people; salary = income a year before tax
  livingMonthly,                                  // living costs a month, excluding loan repayments
  cardLimits,                                     // total credit card limits
  otherRepayMonthly, otherRepayYears,             // car/personal loan repayments and years left
  goal: "GROWTH" | "CASHFLOW" | "HOMEFIRST" | "RETIRE",
  risk: "CAREFUL" | "MIDDLE" | "ADVENTUROUS",
  cash,                                           // savings not in an offset
  home: { has, value, loan: Loan },
  rentals: [{ id, name, kind: "RES" | "COM", value, costBase, rentWeekly, costPct,
              writeOff: "NONE" | "BUILDING" | "NEW", writeOffAmount, owners: [pct1, pct2], loan: Loan }],
  shares: { value, costBase },
  smsf: { has, open },
  assumptions: { ...overrides of DEFAULT_ASSUMPTIONS },   // only the ones changed
  notes,                                          // free text, goes into the plain-words summary
  scenarios: [Scenario],                          // the yardstick + up to 3 plans
  example,                                        // true while the made-up example figures are showing
  fileId, savedAt, updatedAt                      // saving bookkeeping (section 10)
}

Loan = { balance, rate, type: "PI" | "IO", ioYears, yearsLeft, offset }

Scenario = { id, name, baseline?: true, spare: SpareRule, notes, steps: [Step] }
SpareRule = "HOME_OFFSET" | "OWN_OFFSET" | "HIGHEST_RATE" | "CASH"
```

### Steps (what a plan does, and in which year)

| type | fields | what happens |
|---|---|---|
| `BUY` | `year, kind (RES/COM), name, price, rentWeekly, funding (EQUITY/CASH/MIX), cashAmount, lvr, loanType (PI/IO), ioYears, loanYears, writeOff, writeOffAmount, owners` | Buys a property. The main loan is the price × LVR. The rest (deposit, duty, costs) comes from equity in other properties, cash, or both, depending on `funding`. |
| `SMSF` | `year, kind, name, price, rentWeekly, lvr` | Buys a property inside super, with an SMSF loan (LRBA). The deposit comes out of super, not household cash. |
| `SELL` | `year, target (property id), then (PAY_DEBT/OFFSET)` | Sells the property, clears its loans, adds CGT, and uses what's left to pay down other loans or go into the offset. |
| `SHARES` | `year, amount, funding (CASH/EQUITY/RECYCLE), loanType` | Buys shares or ETFs from cash, from borrowing against equity, or by debt recycling. |
| `OFFSET` | `year, amount, to ("home" or a property id)` | Moves savings into a loan's offset. |
| `PI` | `year, target` | Switches a property's interest-only loans to P&I. |

The yardstick scenario (`baseline: true`) has no steps. It always exists, and it can't be deleted.

---

## 4. The engine (`src/engine.js`)

### Exports

```
writeOff, simulate, runAll, rateShifts, individualTax, nswDuty, nswLandTax,
pmt, monthsToClear, parseAmount, DEFAULT_ASSUMPTIONS, CASH_RATE
```

- **Wrapper:** a UMD-style IIFE, so it works both in the page (`window.BlinkEngine`) and in Node (`module.exports`).
- **`runAll(plan)`:** runs every scenario. It returns `{ runs, base, shifts }`. Each run has a `verdict` attached.
- **`simulate(plan, scenario)`:** runs one scenario.

### How a simulation runs

The simulation runs month by month for `horizon × 12` months. Each year is recorded at its last month.

**At the start of each year:**
1. Wages grow by `wageGrowth`, or by `cpi` when it's empty (the default, so pay keeps pace with prices). Rents grow by their growth rates.
2. PAYG tax is withheld on the new salaries.
3. Every loan is repriced: `rate = max(minRate, rateToday + shift[year])`. P&I repayments are recalculated over the term left.
4. The plan's steps for this year run.
5. NSW land tax is worked out per person, on their share of the land value of non-home, non-SMSF properties. It's split back to each property in proportion.

**Every month:**
1. **Pay and living costs:**
   - take-home pay is added; living costs (growing with CPI) and other loan repayments are taken off;
   - employer super goes into super, less the 15% contributions tax: `salary × SG% × 0.85`.
2. **Growth:**
   - property values grow at `(1 + growth)^(1/12)`; residential and commercial have separate rates;
   - shares and super grow the same way.
3. **Each rental:**
   - rent × (1 − vacancy weeks / 52);
   - less running costs (`costPct` of rent) and its land tax share.
   - SMSF properties put their net rent into super instead.
4. **Each loan:**
   - interest is charged on `max(0, balance − offset) × rate / 12`;
   - interest-only loans pay just the interest until `ioLeft` reaches 0, then become P&I over the term left;
   - P&I loans pay `pmt`;
   - a loan is cleared when `balance − offset ≤ 0`, but only if savings and offsets would still hold a **cash reserve** afterwards (three months of living costs, at least $20,000). Any offset money left over goes on via the spare-money rule. Until then, the loan stays "covered": no interest is charged, the money is still there to draw on, and spare money skips it.
   - repayments are charged to whoever the loan is for (`forProp`): the household (home loan), a property's cash flow (including equity loans secured on other property), shares, or super (SMSF loans).
5. **Dividends:** `shares × yield / 12`, added to the shares' cash flow.
6. **Savings interest:** `cash × savingsRate / 12`.
7. **Spare money or a shortfall:**
   - if the month's total (household + each property + shares) is positive, each positive part goes where the **spare rule** sends it, in proportion;
   - if it's negative, the money is **drawn** from savings first, then from offsets (home loan offset first, then the cheapest loan's);
   - if both run out, the amount shows as "overdrawn" and the plan **runs out of cash**.

**At year end — tax:**
1. **Taxable income, for each person:**
   - salary, plus their share of savings interest;
   - plus their ownership share of each property's result;
   - plus their share of the shares' result, with franking gross-up;
   - plus any taxable capital gains.
2. **A property's result for tax** is its cash flow with the principal added back (only interest is deductible), less the write-off.
3. **Negative gearing on (default):** losses reduce tax on wages. **Off:** losses carry forward against later investment income and gains.
4. **Tax** is `individualTax(taxable)` less franking credits. It's settled against PAYG withheld: a refund goes out under the spare rule; a bill is drawn like any shortfall.
5. **Tax effect** is the tax with the investments less the tax without them. Below 0 means the investments save tax.
6. **SMSF net income** is taxed at 15% inside super.

**Each year records** the following fields:
- income: `income` (household pay before tax), `takeHome`, `homeLoanPay`, `living` (living costs plus other loan repayments);
- rates and values: `homeRate`, `value`, `debt`, `offsets`, `cash`, `liquid`, `shares`, `superTotal`, `equity`, `nw`, `nwExSuper`;
- the year's flows: `interest`, `interestSaved`, `rent`, `costs`, `landTax`, `taxEffect`, `writeOffs`;
- investment cash: `investCashBefore`, `investCashAfter` (after the tax effect); `topUp` = what the household had to put in;
- other money: `upfrontCash`, `householdSpare`;
- where money went and came from: `sentTo {homeOffset, ownOffset, otherOffset, cash, payDown}` and `drawnFrom {cash, offsets, overdrawn}`;
- detail: `props[]` and `events[]`.

**The summary** has these fields:
- `nwEnd`, `nwExSuperEnd`, `peakDebt`, `peakLvr`, `totalInterest`;
- `upfrontCash`, `topUps`, `moneyIn` (= upfront + top-ups);
- `worstYear {year, amount}`, `positiveFrom`;
- `homeLoanPaidOff`, `debtFreeYear`, `minLiquid`, `runsOut`.

### Buying (`BUY`)

1. **Costs:**
   - price + stamp duty (NSW function, or `dutyPctOther`% elsewhere) + buying costs (`buyCostsRes` dollars for residential, `buyCostsComPct`% for commercial);
   - the cost base is that total.
2. **Main loan:** price × LVR. The defaults are 80% residential, 70% commercial and 70% SMSF.
3. **Main loan rate:**
   - investment rate (residential) or commercial rate, plus `ioPremium` if interest-only;
   - for an SMSF, the investment rate + `lrbaPremium`, P&I over 20 years.
4. **The rest of the cost:**
   - **`EQUITY` (default):** borrow against other properties first (the home first, then the most usable equity). Usable equity = `value × maxLvr − debt on it`. Equity under $1,000 is skipped. Any remainder comes from cash.
   - **`CASH`:** use cash first, then equity.
   - **`MIX`:** a set cash amount, then equity.
   - Equity loans are tax-deductible, because they're used for the investment, and their repayments are charged to the new property.
   - Anything still uncovered is a **shortfall**: it's drawn anyway and flagged.
5. **Rent:** if no rent is given, it's assumed from a 4% (residential) or 6.5% (commercial) yield.
6. **SMSF:** the deposit comes out of super, in proportion to balances. It's flagged if super is left with less than `smsfBuffer`.
7. **The money chain:** each purchase records `{price, duty, other, total, mainLoan, equity[{from, amount}], cash, fromSuper, short, lvrAfter, borrow}` for the "Where the money comes from" view.

### Borrowing check (serviceability)

This is a rough version of a lender's test. It's run at each purchase.

- **Income:** gross income = salaries + rents × shading (80% residential, 75% commercial), split by ownership. Net income = gross less tax.
- **Repayments:** each loan is counted at P&I, at `rate + assessBuffer` (3%), over its remaining P&I term.
- **Other costs:** living costs (with CPI), other loan repayments, and `cardLimits × 3.8% × 12`.
- **Surplus** = net income − repayments − living − others (the result also records the household `income`):
  - **LIKELY** if ≥ $6,000 a year;
  - **TIGHT** if ≥ 0;
  - otherwise **UNLIKELY**.

### Selling (`SELL`)

1. **Proceeds:** price − selling costs (`sellCostsPct`), less the loans secured on it, net of their offsets.
2. **Equity loans that paid for it but are secured elsewhere:** these are paid down from the proceeds (unless `then: OFFSET`). They stop being deductible.
3. **CGT:** gain = price − costs − cost base. Half the gain is taxable if held 12 months or more. It's split by ownership.
4. **What's left:**
   - with `PAY_DEBT`, it pays down non-deductible loans first, then the dearest;
   - with `OFFSET`, or when anything is left over, it follows the spare rule.
5. **SMSF sales** go back into super.

### Shares (`SHARES`)

- **`CASH`:** drawn from savings, then offsets.
- **`EQUITY`:** a deductible share loan against the property with the most usable equity, interest-only for 5 years by default.
- **`RECYCLE` (debt recycling):** the amount is drawn from savings and offsets and paid off the home loan. The same amount is then borrowed back as a separate, tax-deductible "investment split" to buy the shares. Total debt is unchanged, but interest on that split becomes deductible.

### Spare-money rules

| rule | spare money goes to |
|---|---|
| `HOME_OFFSET` (default) | the home loan offset; with no home loan, the non-deductible loans first, then the dearest |
| `OWN_OFFSET` | a positive property's money goes to its own loan's offset; everything else as HOME_OFFSET |
| `HIGHEST_RATE` | the offset of the dearest loan |
| `CASH` | savings |

### Verdicts (`verdictFor`)

`gain` is the plan's net worth at the end, less the yardstick's.

| verdict | when |
|---|---|
| "Probably not possible on this income" (STOP — red flag) | savings and offsets are used up in some year, or any purchase is UNLIKELY at the lender's test |
| "Worth a closer look" (YES) | gain > max($50,000, 5% of the yardstick's net worth) |
| "Marginal" (MAYBE) | 0 < gain ≤ that threshold |
| "Doesn't beat leaving the cash in the offset" (NO) | gain ≤ 0 |

**Red flags (`verdict.stops`).** Each red flag is a sentence with the figures:
- **Running out:** the year's income before and after tax, what the investments cost or bring in after tax, the home loan repayments and the living costs.
- **A loan a lender would refuse:** the income and how far short the budget is at the test rate.

The page shows them in a red box on the plan's card, with a banner at the top of the results, and in the plain-words summary as "RED FLAG:".

**Amber warnings (`verdict.warnings`):** years when the household spends more than it earns (`householdSpare < 0`) but doesn't run out.

The notes list:
- borrowing results and shortfalls;
- the worst year, as a yearly and weekly amount;
- the year the investments pay for themselves;
- an LVR over 80%;
- whether a careful risk profile is at odds with the plan;
- commercial vacancy risk;
- whether a cash-flow goal is met.

### Reading spoken or typed amounts (`parseAmount`)

`parseAmount` accepts these forms, and returns `null` for anything that isn't a number:

| input | result |
|---|---|
| "$650k" | 650,000 |
| "1.2m" | 1,200,000 |
| "four hundred and twenty thousand" | 420,000 |
| "one point five million" | 1,500,000 |
| "580 dollars" | 580 |
| "6.2%" | 6.2 |

---

## 5. Figures and where they come from

Check these each year. They are all near the top of `engine.js`.

### Income tax, resident individuals

| from | 2026-27 (rate above) | from 1 July 2027 (rate above) |
|---|---|---|
| $18,200 | 15% | 14% |
| $45,000 | 30% (tax at that point $4,020) | 30% ($3,752) |
| $135,000 | 37% ($31,020) | 37% ($30,752) |
| $190,000 | 45% ($51,370) | 45% ($51,102) |

- **Medicare levy:** 2%, phased in above $27,222 (10% of the excess until it reaches 2%).
- **Source:** the ATO's resident tax rates, and the legislated cuts to the 16% rate (15% from 1 July 2026, 14% from 1 July 2027).
- **Simplification:** the engine switches tables on the calendar year (2027 and later uses the 14% table).

### NSW transfer (stamp) duty, 2026-27

| over | duty |
|---|---|
| $0 | $1.25 per $100 |
| $18,000 | $225 + $1.50 per $100 over |
| $38,000 | $525 + $1.75 per $100 over |
| $103,000 | $1,662 + $3.50 per $100 over |
| $387,000 | $11,602 + $4.50 per $100 over |
| $1,290,000 | $52,237 + $5.50 per $100 over |
| $3,870,000 (residential only — premium) | $194,137 + $7.00 per $100 over |

- The minimum duty is $20.
- **Check:** $700,000 residential comes to $25,687.
- **Source:** Revenue NSW. The thresholds are indexed every 1 July.

### NSW land tax

- **Rate:** $100 + 1.6% of each owner's taxable land value over $1,075,000.
- **Premium rate:** above $6,571,000, it's $88,036 + 2%.
- **Exemptions:** the home and SMSF property are left out.
- **Land value:** a share of the property's value (residential 55%, commercial 45%).
- **Source:** Revenue NSW. The general threshold has been frozen since 2025.

### Interest rate cycle

- **Data:** RBA cash rate yearly averages from 2000 to 2025 (approximate), in `CASH_RATE`.
- **Detrending:** the long downward drift is removed with a straight-line (least squares) fit, which leaves the ups and downs.
- **Shift each year:** `shift[y] = (cycle[start + y] − cycle[start]) × cycleScale`, wrapping round after 2025.
- **Settings:** you can choose the cycle start year and the size of the swings (0.5× to 1.5×). "Flat" keeps today's rates throughout.
- **Floor:** rates never go below `minRate`, which is 2% by default.

### Write-offs (depreciation)

- **Building (Division 43):**
  - 2.5% a year of the construction cost, for up to 40 years;
  - construction cost = price × 40% (residential) or 50% (commercial).
- **Fittings (Division 40):** only with "new or near-new". 1% of the price in year 1, falling 20% a year. Second-hand residential fittings can't be claimed (rules since 2017).
- **Report figure:** if the person enters a figure from a depreciation (quantity surveyor's) report, it's used instead.

### Default assumptions (`DEFAULT_ASSUMPTIONS`)

These are deliberately middle-of-the-road, not optimistic.

**Timeframe and rates**

| key | default | note |
|---|---|---|
| horizon | 20 | years (10–30 in the page; 5–30 in the engine) |
| homeRate / invRate / comRate | 5.8 / 6.2 / 7.2 | % today |
| ioPremium / lrbaPremium | 0.4 / 1.2 | % extra for interest-only / SMSF loans |
| minRate | 2 | % floor |
| savingsRate | 4 | % |

**Growth**

| key | default | note |
|---|---|---|
| cpi / wageGrowth | 2.75 / empty | % a year; empty pay rises = in line with CPI |
| resGrowth / comGrowth | 5 / 3 | % a year, values |
| resRentGrowth / comRentGrowth | 3.5 / 3 | % a year |

**Running a property**

| key | default | note |
|---|---|---|
| resVacancyWeeks / comVacancyWeeks | 2 / 6 | weeks empty a year |
| resCostPct / comCostPct | 25 / 12 | running costs, % of rent (commercial is net lease) |
| landPctRes / landPctCom | 55 / 45 | land value, % of property value |

**Buying, selling and lending**

| key | default | note |
|---|---|---|
| buyCostsRes / buyCostsComPct | $4,000 / 1.5% | legal and inspections |
| sellCostsPct | 2.5 | agent and legal |
| maxLvr | 80 | most you'd borrow against a property, for equity |
| resLvr / comLvr / smsfLvr | 80 / 70 / 70 | bank lends, % of price |

**Shares and super**

| key | default | note |
|---|---|---|
| shareGrowth / shareYield / franking | 4.5 / 3.5 / 70 | % |
| superReturn / superGuarantee | 6.5 / 12 | % after fees and tax / % of pay |
| smsfBuffer | $30,000 | cash to keep in an SMSF after buying |

**Lender's test and tax**

| key | default | note |
|---|---|---|
| assessBuffer | 3 | lender's test rate buffer, % |
| resShade / comShade | 80 / 75 | % of rent a lender counts |
| cardServicing | 3.8 | % of card limits a month a lender counts |
| negativeGearing | true | today's rules |
| buildingPctRes / buildingPctCom / fittingsPct | 40 / 50 / 1 | % of price |
| state / dutyPctOther | NSW / 4.5 | other states: duty % only, no land tax |

---

## 6. The pages (`src/app.js`)

The page is plain JavaScript that re-renders the current page's HTML from `state` after each change. Every input carries `data-path` (a dotted path into `state`, e.g. `rentals.0.loan.offset`) and `data-kind` (`money`, `num`, `text`, `select`, `bool`). One `change` handler and one `input` handler write the value back to `state`, save it, and re-render, keeping focus and cursor position.

Results are computed with `BlinkEngine.runAll(state)` and cached until the next edit.

### Header

- **Brand:** "Blink Check".
- **Tools:** Save a copy (or Copy my figures inside a host frame), Load figures, Start again, and Print.
- **Tabs:** 1 You · 2 What you own · 3 Plans · 4 Blink check · 5 Assumptions · ? Help.

The page is reachable by `#hash` (e.g. `#check`).

### The pages

1. **You:**
   - one or two people (name, income, super);
   - living costs a month, credit card limits, and other loan repayments and years left;
   - goal and risk chips, and a look-ahead of 10/15/20/25/30 years;
   - notes ("What we're trying to work out").
2. **What you own:**
   - the home (value, loan, type, IO years, years left, offset) with a payoff note: "With $60,000 in the offset it's paid off in 18 years 2 months instead of 25 years, saving $X";
   - rentals, with kind, value, cost base, rent, running costs %, write-off type or report figure, ownership split, and their loan;
   - savings, shares, super, and SMSF toggles.
3. **Plans:**
   - plan tabs: the yardstick, then up to 3 plans;
   - for each plan: name, spare-money rule, notes, and the step cards sorted by year;
   - "Add a step" buttons: Buy residential, Buy commercial, Sell a property, Buy shares, SMSF purchase (only if either SMSF box is ticked), Put cash in an offset, and Switch a loan to P&I;
   - copy or delete a plan, with a confirmation.
4. **Blink check:**
   - a verdict card for each run: the gain against the yardstick, the key figures and the notes;
   - a red banner at the top when any plan probably won't work, and a red box on that plan's card;
   - **Wealth, debt and cash flow:**
     - pick one plan, tick others to lay over it, and tick which measures to show;
     - **top chart, "What you own and owe":** wealth (net worth, solid) and debt (dashed), in each plan's colour;
     - **bottom chart, "Money each year":** income before tax (dotted, in the text colour; the same in every plan) and the investments' cash flow after tax (solid). Below zero is shaded "costs you money";
     - two charts rather than one with two scales, so yearly amounts aren't squashed against multi-million totals;
     - the charts share a year cursor, and hovering one moves both;
     - a year slider (easy on a phone) moves the cursor and updates the comparison without redrawing the page;
     - the comparison is sentences ("By year 20, compared with A, B leaves you with $1.7m less wealth and $310k more debt; its investments cost you money in 10 years instead of 5") and a table: wealth, debt, income, cash flow, years costing money, own money put in, and the debt-free year;
   - **Compare one measure:** one chart with metric chips (net worth, net worth outside super, debt, equity, investments' cash after tax, household spare cash, interest rate) and a tick box per plan to overlay or hide it;
   - "Where the money comes from" (the money chain per purchase, with the borrowing check);
   - "In plain words — for your accountant or broker" with Copy;
   - the year-by-year table.
5. **Assumptions:**
   - the rate model and a chart of the home loan rate;
   - every default, in groups: rates, growth, running a property, buying and selling, tax, and the lender's test;
   - a reset button, with a confirmation.
6. **Help:**
   - what it's for and how to use it;
   - what the results mean;
   - a glossary built from the `HELP` map;
   - what it doesn't cover;
   - how to rebuild it, with buttons to show or save this guide.

### Help buttons

- **The map:** `HELP` maps a key to `[title, explanation]`.
- **Adding a button:** any field gets one by passing `{ help: "key" }`. The button sits next to the label, has a 42px tap area, and toggles the explanation under the field (`ui.openHelp[id]`).
- **Where they appear:** offset, P&I/IO, LVR, equity, yield and cap rate, net lease, depreciation, CGT cost base, serviceability, debt recycling, SMSF/LRBA, franking, duty, land tax, vacancy, the rate cycle, the spare rule, the yardstick, top-ups and the money chain.
- **Rent hint:** under a rent box, the page shows the gross and net yield, or for commercial the **cap rate**: `rent × 52 × (1 − costs%) ÷ price`. With no rent entered, it shows a typical rent at a 4% yield or 6.5% cap rate.

### Charts

- **Drawing:** `chart(id, series, H, format, opts)` draws SVG at a narrower size on phones (under 600px, so the text stays readable; it redraws if the width crosses that line), with `opts.group` / `opts.at` for linked cursors and `opts.shadeNegative` for the shaded band below zero. It draws with gridlines, axis labels in short money ("$1.2m"), one line per series, and a dashed line for the yardstick.
- **Hover:** hovering or touching shows a tooltip with every series' value for that year.
- **Colours:** series colours are CSS tokens `--s0`…`--s3`, matched to the plan tabs' dots.

### Plain-words summary

`plainWords(R)` writes, in the household's own voice:
- **ABOUT US:** incomes, living costs, home and loans, rentals, savings, shares, cards and loans, goal, risk, and "what we're trying to work out".
- **IDEA: <plan name>, for each plan:**
  - each step in words, by year;
  - where spare money goes;
  - the rough result against the offset and the verdict;
  - their own money in, and the hardest year;
  - the borrowing check for each purchase;
  - the plan's notes, as "Our questions".
- **A closing line** saying these are broad estimates, not advice.

It exists because many people find it hard to describe their ideas to an adviser.

---

## 7. Look and feel

- **Fonts:** Space Grotesk for headings and Inter for text, with system fallbacks.
- **Theme:** colour tokens on `:root`, with a dark theme under `prefers-color-scheme: dark`. It can be forced with `data-theme`.
- **Colours:**
  - one accent colour (`--accent`, violet);
  - amber for warnings;
  - red only for destructive actions and errors;
  - green for "worth a closer look".
- **Size and layout:**
  - every touch target is at least 40px;
  - the main action is at the top;
  - there's no permanent search bar;
  - it works at 360px wide with no sideways scrolling; wide tables scroll inside their own box.
- **Deleting:** anything that deletes asks first, and uses a bin icon.
- **Print:** a print stylesheet hides the tools and buttons.

---

## 8. Spoken input

- **Typing boxes:** money and number boxes are `type="text"` with `inputmode="decimal"`, so the phone keyboard's microphone can be used.
- **Reading the value:** on change, `parseAmount` reads what was typed or said. If it can't read it, the box keeps the old value.
- **Showing the value:** money is shown as "$650,000".

---

## 9. Privacy

- **The person's figures:**
  - nothing is sent anywhere; there are no accounts, analytics or uploads;
  - figures are kept in the browser (localStorage) while working, and in the file when saved.
- **Outside requests:** the only one is the Google Fonts stylesheet. Remove the `<link>` tags in `head.html` for a fully offline file.
- **Example figures:** these are for a made-up household (Alex and Sam). Never put a real person's figures in the repository or the built files.

---

## 10. Saving into the file

This is the important design decision. A browser-only tool loses everything when the browser is cleared, and can't be sent to an accountant. So the figures live **inside the HTML file**:

1. **The saved figures:** `body.html` ends with `<script id="saved-figures" type="application/json">null</script>`.
2. **Capturing the clean page:** when the page loads, before rendering, `app.js` captures `PRISTINE` = the whole page's HTML.
3. **"Save a copy":**
   - it replaces that script's contents with `JSON.stringify(state)`, escaping `<` as `<`;
   - it downloads the result as a new `.html` file (Blob + `<a download>`);
   - before saving, tick boxes let the person leave out names, figures, plans or notes (`forSaving(opts)`);
   - "Save a blank copy" saves `null`, i.e. a fresh tool.
4. **On open:**
   - it reads the embedded figures;
   - working changes are kept in localStorage under `blink-check-v1:<fileId>`, so each saved file has its own working copy;
   - the browser copy wins only if it's newer than the file's `savedAt`.
5. **Warnings and starting again:**
   - an amber banner warns when there are changes not yet saved into a file;
   - "Start again" either clears the plans and keeps the figures, or clears everything. Both ask first.
6. **Inside a host frame (e.g. a claude.ai artifact):**
   - downloads are blocked there, so `STANDALONE` (`window.self === window.top`) is false;
   - instead of Save, the page offers "Copy my figures" (JSON in a box);
   - "Load figures" pastes that JSON back in.

---

## 11. The rebuild guide travels in the file

`build.mjs` puts this guide inside the page as `<script id="rebuild-guide" type="text/plain">`, with any closing script tag inside it escaped (a backslash before the slash), and the page undoes that when it reads the guide. The Help page can show it, or save it as a `.md` file.

So anyone who only has the HTML file still has:
- every line of code, because the scripts are inline and readable;
- this guide.

Saved copies keep it, because `PRISTINE` includes it.

---

## 12. Tests (`test/engine.test.mjs`)

Run with `node --test blink-check/test/engine.test.mjs`. They check:

1. **Offset payoff:** $100k in the offset of a $400k, 30-year loan at 6% clears in 190–200 months, with a repayment of $2,398 a month.
2. **Tax:** tax on $100,000 = 4,020 + 16,500 + 2,000 Medicare.
3. **Stamp duty and land tax:** duty on $700,000 residential = $25,687; land tax is $0 at $1m and $3,300 at $1.275m.
4. **Spoken amounts:** `parseAmount` reads the spoken and typed forms.
5. **Rate cycle:** starts at 0, peaks above +1.5 (2008), and dips below −1; flat gives all zeros.
6. **The money chain:** it adds up (main loan + equity + cash = total), and the verdict gain = the plan's net worth − the yardstick's.
7. **Negative gearing:** on gives tax back in year 1; off gives 0 that year, with the loss carried forward.
8. **Cards and personal loans:** they reduce the borrowing surplus by exactly `15,000 × 3.8% × 12 + 600 × 12`.
9. **Spare money:** each spare rule sends money where it says.
10. **Selling:** clears loans and lowers debt.
11. **Debt recycling:** turns offset cash into shares with a deductible split.
12. **SMSF:** a purchase uses super, not household cash.
13. **A plan that can't be funded:** its verdict is STOP, with a red flag.
14. **Two quick purchases on $200k:** buying in year 8 and again in year 10 raises a red flag.
15. **Pay rises:** pay rises with CPI by default, or by the wage growth figure when one is set; `income` and `takeHome` are recorded.

**Browser checks** (by hand, or with Playwright):
- every page on desktop and on a phone (light and dark), with no sideways scroll and no console errors;
- typing "six hundred and fifty thousand" into a money box;
- chart hover;
- Save a copy with names unticked, then reopening the saved file and seeing the figures, but not the names.

---

## 13. Known limits (and ideas for later)

**Known limits:**
- NSW duty and land tax only; other states use a flat duty %, and land tax isn't estimated.
- No lenders mortgage insurance, fixed rates, offset sweeps between people, trusts, companies, or the Division 293 tax.
- Super can't be accessed (no retirement drawdown phase); SMSF rules are simplified.
- Values and rents move smoothly; real markets don't.

**Ideas for later:**
- Other states' duty and land tax tables.
- A "stress" button: rates +2% for 2 years, plus 6 months vacant.
- A side-by-side table of the plans at year 10 and at the horizon.
- A Monte Carlo option over growth rates.

---

## 14. Rules to keep (if you change it)

- Keep it **one self-contained file**, with no build-time or run-time libraries unless there's a strong reason. Say so before adding one.
- **Never upload or publish anyone's figures.** No analytics, no remote storage.
- Keep the engine **pure** (no DOM) and **tested**. Add a test for each new rule.
- Keep the yardstick: every plan is compared with "cash stays in the offset".
- Keep every figure **conservative**, and list its source in section 5 above.
- Keep the plain-English style: short sentences, Australian spelling, no jargon without a "?" explanation.
- Keep touch targets at 40px or more, and dark mode working. Red is only for destructive actions and errors. Every delete asks first.
- Update this guide when you change behaviour.

---

## 15. Prompts to give an AI assistant

### To rebuild it from scratch

> I'd like you to build "Blink Check", a single-file HTML tool for Australian households. It should answer the question "is our next property or investment move worth researching, compared with leaving the cash in the home loan offset?"
>
> I've attached the rebuild guide (REBUILD-GUIDE.md) and the current blink-check.html, which contains the full working code. Follow the guide's data model, engine rules, pages, saving design and "Rules to keep".
>
> Build it as `src/engine.js` (pure, tested with `node --test`), `src/app.js`, `src/head.html`, `src/body.html` and `build.mjs`, which outputs one HTML file. Then run the tests, open the page in a browser on a phone-sized and a desktop screen, and tell me what you tested and what you didn't.

### To change something

> Here is Blink Check (blink-check.html) and its rebuild guide. I want to change: <describe the change in your own words>.
>
> Please keep to the guide's "Rules to keep". Update the engine tests and the guide, rebuild the file, and tell me plainly what changed and what you checked.

### To update the yearly figures

> Here is Blink Check and its rebuild guide. Please check the figures in section 5 against the current ATO resident tax rates, Revenue NSW transfer duty and land tax thresholds, and the RBA cash rate for the latest full year.
>
> Update `engine.js`, the tests and the guide where they've changed, and add the new year to `CASH_RATE`. Then tell me what changed and where each figure came from.
