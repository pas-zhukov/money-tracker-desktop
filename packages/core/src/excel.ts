import ExcelJS from "exceljs";
import { formatRu } from "./dates.js";
import { money, neg, signum } from "./money.js";
import type { EntryView, PeriodSummary } from "./types.js";
import { typeLabel } from "./types.js";

export function excelFilename(from: string, to: string): string {
  return `доходы-расходы_${from}_${to}.xlsx`;
}

export async function writeExcelReport(
  summary: PeriodSummary,
  entries: EntryView[],
  includeAccounts = false,
): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const summarySheet = book.addWorksheet("Сводка");
  const opsSheet = book.addWorksheet("Операции");

  const incomeFont = { color: { argb: "FF1D6B45" }, bold: true };
  const expenseFont = { color: { argb: "FF9D3B32" }, bold: true };
  const labelFont = { bold: true };

  let row = 1;
  summarySheet.getCell(row, 1).value = "Период";
  summarySheet.getCell(row, 1).font = labelFont;
  summarySheet.getCell(row, 2).value = `${formatRu(summary.from)} — ${formatRu(summary.to)}`;
  summarySheet.getCell(row, 2).font = labelFont;
  row += 1;

  const writeAmount = (label: string, value: string, font: Partial<ExcelJS.Font>) => {
    summarySheet.getCell(row, 1).value = label;
    summarySheet.getCell(row, 1).font = labelFont;
    summarySheet.getCell(row, 2).value = Number(value);
    summarySheet.getCell(row, 2).numFmt = "#,##0.00";
    summarySheet.getCell(row, 2).font = font;
    row += 1;
  };

  writeAmount("Доходы", summary.totals.income, incomeFont);
  writeAmount("Расходы", summary.totals.expense, expenseFont);
  writeAmount(
    "Разница",
    summary.totals.net,
    signum(summary.totals.net) >= 0 ? incomeFont : expenseFont,
  );

  const sf = summary.savingsFlow;
  if (signum(sf.toSavings) !== 0 || signum(sf.fromSavings) !== 0 || signum(sf.net) !== 0) {
    writeAmount("В накопления", sf.toSavings, incomeFont);
    writeAmount("Из накоплений", neg(sf.fromSavings), expenseFont);
    writeAmount(
      "Разница по накоплениям",
      sf.net,
      signum(sf.net) >= 0 ? incomeFont : expenseFont,
    );
  }
  row += 1;

  const incomeCats = summary.byCategory.filter((c) => c.type === "INCOME");
  const expenseCats = summary.byCategory.filter((c) => c.type === "EXPENSE");
  if (incomeCats.length) {
    summarySheet.getCell(row, 1).value = "Доходы по категориям";
    summarySheet.getCell(row, 1).font = labelFont;
    row += 1;
    summarySheet.getCell(row, 1).value = "Категория";
    summarySheet.getCell(row, 2).value = "Сумма";
    row += 1;
    for (const c of incomeCats) {
      summarySheet.getCell(row, 1).value = c.name;
      summarySheet.getCell(row, 2).value = Number(c.amount);
      summarySheet.getCell(row, 2).numFmt = "#,##0.00";
      row += 1;
    }
    row += 1;
  }
  if (expenseCats.length) {
    summarySheet.getCell(row, 1).value = "Расходы по категориям";
    summarySheet.getCell(row, 1).font = labelFont;
    row += 1;
    summarySheet.getCell(row, 1).value = "Категория";
    summarySheet.getCell(row, 2).value = "Сумма";
    row += 1;
    for (const c of expenseCats) {
      summarySheet.getCell(row, 1).value = c.name;
      summarySheet.getCell(row, 2).value = Number(c.amount);
      summarySheet.getCell(row, 2).numFmt = "#,##0.00";
      row += 1;
    }
  }

  if (includeAccounts && summary.byAccount.length) {
    row += 1;
    summarySheet.getCell(row, 1).value = "По счетам";
    summarySheet.getCell(row, 1).font = labelFont;
    row += 1;
  }

  summarySheet.getColumn(1).width = 28;
  summarySheet.getColumn(2).width = 16;

  const incomes = entries.filter((e) => e.type === "INCOME");
  const expenses = entries.filter((e) => e.type === "EXPENSE");
  const savings = entries.filter((e) => e.type === "TO_SAVINGS" || e.type === "FROM_SAVINGS");

  let opRow = 1;
  const writeSection = (title: string, list: EntryView[]) => {
    if (!list.length) return;
    opsSheet.getCell(opRow, 1).value = title;
    opsSheet.getCell(opRow, 1).font = labelFont;
    opRow += 1;
    const headers = ["Дата", "Тип", "Сумма", "Описание", "Категория"];
    if (includeAccounts) headers.push("Счёт");
    headers.forEach((h, i) => {
      opsSheet.getCell(opRow, i + 1).value = h;
      opsSheet.getCell(opRow, i + 1).font = labelFont;
    });
    opRow += 1;
    for (const e of list) {
      let amount = Number(e.amount);
      if (e.type === "EXPENSE" || e.type === "FROM_SAVINGS") amount = -amount;
      opsSheet.getCell(opRow, 1).value = formatRu(e.occurredOn);
      opsSheet.getCell(opRow, 2).value = typeLabel(e.type);
      opsSheet.getCell(opRow, 3).value = amount;
      opsSheet.getCell(opRow, 3).numFmt = "#,##0.00";
      opsSheet.getCell(opRow, 4).value = e.description;
      opsSheet.getCell(opRow, 5).value = e.categoryName || "Без категории";
      if (includeAccounts) opsSheet.getCell(opRow, 6).value = e.accountName;
      opRow += 1;
    }
    opRow += 1;
  };

  writeSection("Доходы", incomes);
  writeSection("Расходы", expenses);
  writeSection("Накопления", savings);

  opsSheet.getColumn(1).width = 12;
  opsSheet.getColumn(2).width = 16;
  opsSheet.getColumn(3).width = 12;
  opsSheet.getColumn(4).width = 36;
  opsSheet.getColumn(5).width = 20;

  // silence unused
  void money;

  const buffer = await book.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}