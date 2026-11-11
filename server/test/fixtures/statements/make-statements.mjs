// Makes the made-up statements in this folder (no real data). Needs Playwright with Chromium: node make-statements.mjs <folder> [tight]
// Made-up bank statements in several layouts, for testing the PDF statement reader.
import { chromium } from "playwright";
import fs from "node:fs";
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const money = (n) => Math.abs(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const SHOPS = ["EFTPOS WOOLWORTHS 1234 ORANGE AU", "VISA DEBIT PURCHASE CARD 4321 BP CONNECT BATHURST", "DIRECT DEBIT AHM HEALTH INSURANCE 99887766", "BPAY ORANGE CITY COUNCIL RATES", "EFTPOS COLES 0456 ORANGE", "WITHDRAWAL ATM ORANGE CENTRAL", "DIRECT DEBIT ST MARYS SCHOOL FEES TERM PAYMENT", "OSKO PAYMENT TO J CITIZEN RENT", "VISA DEBIT PURCHASE NETFLIX.COM MELBOURNE"];
const INS = ["DEPOSIT SALARY ACME PTY LTD", "OSKO DEPOSIT FROM A CITIZEN", "INTEREST PAID", "DEPOSIT ATO REFUND"];
function txns(start, days, opening, n) {
  const out = []; let bal = opening;
  for (let i = 0; i < n; i++) {
    const d = new Date(start.getTime() + Math.floor((i / n) * days) * 86400000);
    const inc = rnd() < 0.25;
    const amt = inc ? Math.round(rnd() * 300000) / 100 + 50 : -(Math.round(rnd() * 25000) / 100 + 3);
    bal = Math.round((bal + amt) * 100) / 100;
    const desc = inc ? INS[Math.floor(rnd() * INS.length)] : SHOPS[Math.floor(rnd() * SHOPS.length)];
    out.push({ d, amt, bal, desc });
  }
  return out;
}
const ddmmyy = (d) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCFullYear()).slice(2)}`;
const ddMon = (d) => `${String(d.getUTCDate()).padStart(2, "0")} ${MON[d.getUTCMonth()]}`;
const monDd = (d) => `${MON[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}`;
const css = (process.argv[3] === "tight" ? "" : "<!doctype html>") + `<style>body{font-family:Arial;font-size:9px;margin:0} .pg{page-break-after:always;padding:30px 36px} table{width:100%;border-collapse:collapse} td,th{padding:3px 4px;vertical-align:top} .r{text-align:right} .hdr{font-size:11px;margin-bottom:10px} .foot{margin-top:14px;color:#555}</style>`;
const D = new Date(Date.UTC(2023, 0, 1));
const out = {};

// A: Westpac-like. dd/mm/yy dates, DEBIT/CREDIT/BALANCE, wrapped descriptions, 2 pages.
{
  const t = txns(D, 89, 2000, 46); const pages = [t.slice(0, 26), t.slice(26)];
  let h = css;
  pages.forEach((rows, pi) => {
    h += `<div class=pg><div class=hdr><b>Westpac Banking Corporation</b> ABN 33 007 457 141<br>Westpac Choice<br>Statement Period 01/01/2023 - 31/03/2023<br>BSB 032-000 Account Number 12 3456</div>`;
    h += `<table><tr><th align=left width=60>DATE</th><th align=left>TRANSACTION DESCRIPTION</th><th class=r width=70>DEBIT</th><th class=r width=70>CREDIT</th><th class=r width=80>BALANCE</th></tr>`;
    if (pi === 0) h += `<tr><td>01/01/23</td><td>OPENING BALANCE</td><td></td><td></td><td class=r>2,000.00</td></tr>`;
    for (const r of rows) h += `<tr><td>${ddmmyy(r.d)}</td><td>${r.desc.length > 40 ? r.desc.slice(0, 34) + "<br>" + r.desc.slice(34) : r.desc}</td><td class=r>${r.amt < 0 ? money(r.amt) : ""}</td><td class=r>${r.amt > 0 ? money(r.amt) : ""}</td><td class=r>${money(r.bal)}</td></tr>`;
    if (pi === 1) h += `<tr><td>31/03/23</td><td>CLOSING BALANCE</td><td></td><td></td><td class=r>${money(t.at(-1).bal)}</td></tr>`;
    h += `</table><div class=foot>Page ${pi + 1} of 2</div></div>`;
  });
  out.westpac = { html: h, txns: t };
}
// B: St.George-like. "15 Dec" dates across a year end, date only on first of the day, balance at end of day with CR, brought/carried forward.
{
  const start = new Date(Date.UTC(2023, 11, 15));
  const t = txns(start, 20, 850.5, 40); const pages = [t.slice(0, 22), t.slice(22)];
  let h = css;
  pages.forEach((rows, pi) => {
    h += `<div class=pg><div class=hdr><b>St.George Bank</b> - A Division of Westpac Banking Corporation<br>Complete Freedom Account<br>Statement period 15 Dec 2023 to 14 Mar 2024</div>`;
    h += `<table><tr><th align=left width=50>Date</th><th align=left>Transaction details</th><th class=r width=80>Withdrawals ($)</th><th class=r width=80>Deposits ($)</th><th class=r width=90>Balance ($)</th></tr>`;
    h += pi === 0 ? `<tr><td>15 Dec</td><td>Opening balance</td><td></td><td></td><td class=r>850.50 CR</td></tr>` : `<tr><td></td><td>Balance brought forward</td><td></td><td></td><td class=r>${money(pages[0].at(-1).bal)} CR</td></tr>`;
    rows.forEach((r, i) => {
      const prev = i > 0 ? rows[i - 1] : null; const next = rows[i + 1];
      const firstOfDay = !prev || prev.d.getTime() !== r.d.getTime();
      const lastOfDay = !next || next.d.getTime() !== r.d.getTime();
      h += `<tr><td>${firstOfDay ? ddMon(r.d) : ""}</td><td>${r.desc}</td><td class=r>${r.amt < 0 ? money(r.amt) : ""}</td><td class=r>${r.amt > 0 ? money(r.amt) : ""}</td><td class=r>${lastOfDay ? money(r.bal) + " CR" : ""}</td></tr>`;
    });
    h += pi === 0 ? `<tr><td></td><td>Balance carried forward</td><td></td><td></td><td class=r>${money(rows.at(-1).bal)} CR</td></tr>` : `<tr><td>14 Mar</td><td>Closing balance</td><td></td><td></td><td class=r>${money(t.at(-1).bal)} CR</td></tr>`;
    h += `</table><div class=foot>Page ${pi + 1} of 2</div></div>`;
  });
  out.stgeorge = { html: h, txns: t };
}
// C: Macquarie-like. "Jul 03" dates, lowercase headings, one page.
{
  const start = new Date(Date.UTC(2022, 6, 1));
  const t = txns(start, 30, 15234.75, 24);
  let h = css + `<div class=pg><div class=hdr><b>Macquarie Bank Limited</b> ABN 46 008 583 542<br>Macquarie transaction account<br>statement period 1 Jul 22 to 31 Jul 22</div>`;
  h += `<table><tr><th align=left width=50>date</th><th align=left>description</th><th class=r width=80>debits</th><th class=r width=80>credits</th><th class=r width=90>balance</th></tr>`;
  h += `<tr><td>Jul 01</td><td>opening balance</td><td></td><td></td><td class=r>15,234.75</td></tr>`;
  for (const r of t) h += `<tr><td>${monDd(r.d)}</td><td>${r.desc}</td><td class=r>${r.amt < 0 ? money(r.amt) : ""}</td><td class=r>${r.amt > 0 ? money(r.amt) : ""}</td><td class=r>${money(r.bal)}</td></tr>`;
  h += `<tr><td>Jul 31</td><td>closing balance</td><td></td><td></td><td class=r>${money(t.at(-1).bal)}</td></tr></table></div>`;
  out.macquarie = { html: h, txns: t };
}
// D: credit card (a smaller bank). One amount column, payments "CR", no balance column; opening and closing in a summary box.
{
  const start = new Date(Date.UTC(2024, 1, 3));
  let owing = 1234.56; const t = [];
  for (let i = 0; i < 18; i++) {
    const d = new Date(start.getTime() + i * 1.6 * 86400000); d.setUTCHours(0, 0, 0, 0);
    const pay = i === 9; const amt = pay ? 1000 : -(Math.round(rnd() * 15000) / 100 + 5);
    owing = Math.round((owing - amt) * 100) / 100;
    t.push({ d, amt, desc: pay ? "PAYMENT RECEIVED - THANK YOU" : SHOPS[i % SHOPS.length].replace("EFTPOS ", "") });
  }
  let h = css + `<div class=pg><div class=hdr><b>Bendigo Bank</b> Credit Card Statement<br>Card number 4564 XXXX XXXX 9876<br>Statement period 03 Feb 2024 to 02 Mar 2024</div>`;
  h += `<table style="width:50%;margin-bottom:12px"><tr><td>Opening balance</td><td class=r>$1,234.56</td></tr><tr><td>Closing balance</td><td class=r>$${money(owing)}</td></tr><tr><td>Minimum payment due</td><td class=r>$${money(owing * 0.02)}</td></tr></table>`;
  h += `<table><tr><th align=left width=70>Date</th><th align=left>Transaction details</th><th class=r width=90>Amount ($)</th></tr>`;
  for (const r of t) h += `<tr><td>${String(r.d.getUTCDate()).padStart(2, "0")}-${MON[r.d.getUTCMonth()]}-24</td><td>${r.desc}</td><td class=r>${money(r.amt)}${r.amt > 0 ? " CR" : ""}</td></tr>`;
  h += `</table></div>`;
  out.card = { html: h, txns: t, closing: owing };
}
// E: Westpac-like with one balance misprinted (the reader must flag it).
{
  const t = txns(new Date(Date.UTC(2023, 3, 1)), 29, 500, 15);
  let h = css + `<div class=pg><div class=hdr><b>Westpac Banking Corporation</b><br>Statement Period 01/04/2023 - 30/04/2023</div>`;
  h += `<table><tr><th align=left width=60>DATE</th><th align=left>TRANSACTION DESCRIPTION</th><th class=r width=70>DEBIT</th><th class=r width=70>CREDIT</th><th class=r width=80>BALANCE</th></tr>`;
  h += `<tr><td>01/04/23</td><td>OPENING BALANCE</td><td></td><td></td><td class=r>500.00</td></tr>`;
  t.forEach((r, i) => (h += `<tr><td>${ddmmyy(r.d)}</td><td>${r.desc}</td><td class=r>${r.amt < 0 ? money(r.amt) : ""}</td><td class=r>${r.amt > 0 ? money(r.amt) : ""}</td><td class=r>${money(i === 7 ? r.bal + 10 : r.bal)}</td></tr>`));
  h += `</table></div>`;
  out.broken = { html: h, txns: t };
}
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage();
const dir = process.argv[2];
fs.mkdirSync(dir, { recursive: true });
const expected = {};
for (const [name, v] of Object.entries(out)) {
  await p.setContent(v.html);
  await p.pdf({ path: `${dir}/${name}.pdf`, format: "A4" });
  expected[name] = { count: v.txns.length, sum: Math.round(v.txns.reduce((s, r) => s + r.amt, 0) * 100) / 100, first: v.txns[0], last: v.txns.at(-1) };
}
// F: a scan — the Westpac page as a picture, no text layer.
await p.setContent(out.macquarie.html);
const png = await p.screenshot({ fullPage: true });
await p.setContent(`<img src="data:image/png;base64,${png.toString("base64")}" style="width:100%">`);
await p.pdf({ path: `${dir}/scanned.pdf`, format: "A4" });
fs.writeFileSync(`${dir}/expected.json`, JSON.stringify(expected, null, 1));
await b.close();
