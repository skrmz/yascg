export const tablePrintEn = {
  action: "Print table",
  title: "Table print preview",
  description: "Print all matching entries in the current table order.",
  noMatches: "No matching entries to print.",
  orientation: "Orientation",
  portrait: "Portrait",
  landscape: "Landscape",
  filters: "Filters",
  noFilters: "All entries",
  sort: "Sort order",
  rows: "Printable entries",
  columns: "Included columns",
  changeColumns: "Change visible columns",
  pages: "Print pages",
  page: "Page {{number}}",
  continued: "Continued",
  preparing: "Measuring print pages…",
  showPrintHelp: "Printing instructions",
  doesNotFit:
    "The table cannot fit on this paper at 6 pt without clipping. Change the orientation, paper size, or visible columns.",
  printHelp:
    "Scroll the preview to see each page. In the print dialog, use the selected paper and orientation, 100% scale, no margins, and turn off browser headers and footers.",
} as const;

export const tablePrintDe = {
  action: "Tabelle drucken",
  title: "Tabellen-Druckvorschau",
  description: "Druckt alle passenden Einträge in der aktuellen Tabellensortierung.",
  noMatches: "Keine passenden Einträge zum Drucken.",
  orientation: "Ausrichtung",
  portrait: "Hochformat",
  landscape: "Querformat",
  filters: "Filter",
  noFilters: "Alle Einträge",
  sort: "Sortierung",
  rows: "Druckbare Einträge",
  columns: "Enthaltene Spalten",
  changeColumns: "Sichtbare Spalten ändern",
  pages: "Druckseiten",
  page: "Seite {{number}}",
  continued: "Fortsetzung",
  preparing: "Druckseiten werden vermessen …",
  showPrintHelp: "Druckhinweise",
  doesNotFit:
    "Die Tabelle passt bei 6 pt nicht vollständig auf dieses Papier. Ändere die Ausrichtung, das Papierformat oder die sichtbaren Spalten.",
  printHelp:
    "Scrolle durch die Vorschau, um alle Seiten zu sehen. Verwende im Druckdialog das gewählte Papierformat und die gewählte Ausrichtung, 100 % Skalierung und keine Ränder. Schalte Kopf- und Fußzeilen aus.",
} as const;
