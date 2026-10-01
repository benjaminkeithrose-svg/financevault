// Australian financial year: 1 July -> 30 June, labelled "YYYY-YY".

export function financialYearLabelForDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-indexed; June = 5
  const startYear = month >= 6 ? year : year - 1; // July onward starts the FY
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
}

export function financialYearBounds(label: string): { start: Date; end: Date } {
  const [startYearStr] = label.split("-");
  const startYear = Number(startYearStr);
  const start = new Date(Date.UTC(startYear, 6, 1)); // 1 July
  const end = new Date(Date.UTC(startYear + 1, 5, 30, 23, 59, 59)); // 30 June
  return { start, end };
}

export function financialYearRange(fromYear: number, toYear: number): string[] {
  const labels: string[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    labels.push(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  }
  return labels;
}
