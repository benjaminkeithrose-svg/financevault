import { PrismaClient } from "@prisma/client";
import { financialYearBounds, financialYearRange } from "../src/services/financialYear.js";

const prisma = new PrismaClient();

const TAX_CATEGORIES: Array<{ name: string; group: "INCOME" | "EXPENSE" | "CAPITAL" | "OTHER" }> = [
  { name: "Employment Income", group: "INCOME" },
  { name: "Interest Income", group: "INCOME" },
  { name: "Dividend Income", group: "INCOME" },
  { name: "Distribution Income", group: "INCOME" },
  { name: "Rental Income", group: "INCOME" },
  { name: "Other Income", group: "INCOME" },
  { name: "Investment Expenses", group: "EXPENSE" },
  { name: "Property Expenses", group: "EXPENSE" },
  { name: "Work-Related Expenses", group: "EXPENSE" },
  { name: "Professional Fees", group: "EXPENSE" },
  { name: "Insurance", group: "EXPENSE" },
  { name: "Other Expenses", group: "EXPENSE" },
  { name: "Capital Gain", group: "CAPITAL" },
  { name: "Capital Loss", group: "CAPITAL" },
  { name: "Not Tax Relevant", group: "OTHER" },
];

async function main() {
  // Seed financial years from 2015-16 through five years beyond the current FY
  const currentYear = new Date().getUTCFullYear();
  const labels = financialYearRange(currentYear - 10, currentYear + 5);
  for (const label of labels) {
    const { start, end } = financialYearBounds(label);
    await prisma.financialYear.upsert({
      where: { label },
      update: {},
      create: { label, startDate: start, endDate: end },
    });
  }

  for (const category of TAX_CATEGORIES) {
    await prisma.taxCategory.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    });
  }

  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, allowExternalAiProcessing: false },
  });

  console.log(`Seeded ${labels.length} financial years and ${TAX_CATEGORIES.length} tax categories.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
