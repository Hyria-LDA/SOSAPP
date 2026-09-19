import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

type ReportRows = unknown[][];

/** Generates a real PDF in memory; no report data is sent to an external service. */
export function buildPartnerReportPdf({ identity, summary, details }: {
  identity: ReportRows;
  summary: ReportRows;
  details: ReportRows;
}): Uint8Array {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const rows = (values: ReportRows) => values.map((row) => row.map((value) => String(value ?? "")));
  doc.setProperties({ title: "Relatório individual do parceiro", author: "SOS Marceneiros" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(27, 70, 49);
  doc.text("SOS Marceneiros", 14, 18);
  doc.setFontSize(12);
  doc.text("Relatório individual do parceiro", 14, 26);

  const defaults = {
    margin: { top: 15, right: 14, bottom: 18, left: 14 },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2, overflow: "linebreak" as const },
    headStyles: { fillColor: [27, 70, 49] as [number, number, number] },
    alternateRowStyles: { fillColor: [244, 247, 245] as [number, number, number] },
    rowPageBreak: "avoid" as const,
  };
  autoTable(doc, {
    ...defaults, startY: 32, theme: "plain", body: rows(identity),
    columnStyles: { 0: { cellWidth: 30, fontStyle: "bold" } },
  });
  autoTable(doc, {
    ...defaults, head: [["Resumo do período", "Valor"]], body: rows(summary),
    columnStyles: { 0: { cellWidth: 125 }, 1: { halign: "right" } },
  });
  autoTable(doc, {
    ...defaults,
    head: [["Empresa", "Cidade/UF", "Cadastro", "Status do cadastro", "Status da empresa", "Comissão (R$)", "Pago"]],
    body: details.length ? rows(details) : [[{ content: "Nenhuma indicação no período selecionado.", colSpan: 7 }]],
    styles: { ...defaults.styles, fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 42 }, 1: { cellWidth: 30 }, 2: { cellWidth: 22 },
      3: { cellWidth: 25 }, 4: { cellWidth: 25 }, 5: { cellWidth: 24, halign: "right" },
      6: { cellWidth: 14 },
    },
  });
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("SOS Marceneiros | Relatório do parceiro", 14, 287);
    doc.text(`Página ${page} de ${pageCount}`, 196, 287, { align: "right" });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
