# Blink Check

A quick check, a "blink", on one question: **is our next move worth researching properly, or are we better off leaving the cash in the home loan offset?**

You put in what you earn, own and owe. Then you sketch up to three plans, for example:
- buy a second property now and a third in year 8;
- buy commercial and sell a rental in year 10;
- debt recycle into shares.

Blink Check runs each plan forward 10 to 30 years with interest rates rising and falling, and tells you:
- whether the plan beats leaving the cash in the offset, and by roughly how much;
- how much of your own money it needs, at purchase and every year after tax, and the worst year;
- where the money for each purchase comes from (the loan, borrowing against equity, or your cash), and whether a lender would probably approve it;
- where spare money goes once a property pays for itself;
- charts of net worth, debt, equity and cash flow, with the plans overlaid;
- a summary in plain words to send to your accountant or broker.

**For retirees too.** Switch the first page to **Retired** to see:
- how long savings and super last when living on a super pension and the Age Pension;
- whether buying a home (or downsizing) leaves enough to live on;
- the most a plan could spend on the home and still have money at 90, 95 or 100;
- home equity against cash and super at year 20.

It counts:
- P&I and interest-only loans, with an offset on every loan;
- stamp duty, land tax, negative gearing, building and fittings write-offs, capital gains tax and franking credits;
- your credit cards and personal loans, the way a lender would.

It's general information with cautious figures, not advice. It's made for Australian households, with NSW stamp duty and land tax.

## Using it

1. Open **`blink-check.html`** in any browser: Chrome, Edge, Safari or Firefox, on a computer or phone. There's nothing to install and no account.
2. Work through the tabs: **You → What you own → Plans → Blink check**. Tap the **?** next to anything that isn't obvious, or open **Help**.
3. On a phone, tap a box and use the keyboard's microphone to say amounts, such as "six hundred and fifty thousand".
4. **Save a copy** saves a new copy of the file with your figures inside.
   - Open that file to carry on later.
   - Email it to your accountant or broker. Untick names or notes first if you'd rather leave them out.
   - To start again, open a blank copy, or use **Start again**.

## Privacy

Your figures never leave your device. There are no accounts, no tracking and no uploads. The page only loads its fonts from the internet, and works without them.

Please don't commit anyone's real figures to this repository.

## For developers, or anyone rebuilding it with an AI assistant

Everything you need is in this folder. The full rebuild guide is **[`docs/REBUILD-GUIDE.md`](docs/REBUILD-GUIDE.md)**. It covers:
- the data model;
- every calculation and figure, with sources;
- the pages and the saving design;
- the tests;
- the rules to keep;
- prompts to give your own AI assistant (such as Claude) to rebuild it, change it, or update the yearly tax figures.

The same guide is also built **inside** `blink-check.html`, under Help → "Rebuilding or changing Blink Check". So the single file is enough on its own.

```
node blink-check/build.mjs                     # builds dist/blink-check.html (and dist/artifact.html)
node --test blink-check/test/engine.test.mjs   # engine tests
```

You need Node 18 or later. There are no dependencies to install.

| File | What it is |
|---|---|
| `src/engine.js` | all the money working-out (pure functions, tested) |
| `src/app.js` | the pages, help, charts and saving |
| `src/head.html`, `src/body.html` | styles and page skeleton |
| `build.mjs` | joins it all into one HTML file |
| `test/engine.test.mjs` | engine tests |
| `dist/blink-check.html` | the finished file to use and share |

## Licence and disclaimer

Free to use, share and adapt to help people. It comes with no warranty. It isn't financial, tax or credit advice: check any plan with a licensed adviser, your accountant and a broker before acting.
