import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vite-plus/test";
import i18n from "@/i18n.ts";
import { measureTablePrint } from "@/print/table-print-layout.ts";
import { TablePrintDialog } from "./TablePrintDialog.tsx";

vi.mock("@/print/table-print-layout.ts", { spy: true });

const testColumns = [
  { id: "name", label: "Name" },
  { id: "description", label: "Description" },
];
const testRows = [
  { id: "2", cells: { name: "Bless", description: "Complete description 2" } },
  { id: "1", cells: { name: "Aid", description: "Complete description 1" } },
];
const exampleLayout = {
  fontPt: 9,
  widths: [200, 600],
  pages: testRows.map(({ id, cells }) => [{ key: id, cells: [cells.name, cells.description] }]),
};

afterEach(async () => {
  vi.restoreAllMocks();
  await i18n.changeLanguage("en");
});

it("prints the measured preview pages with the chosen geometry and restores the title", async () => {
  const user = userEvent.setup();
  vi.mocked(measureTablePrint).mockReturnValue(exampleLayout);
  const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
  const rowFactory = vi.fn(() => testRows);
  const previousTitle = document.title;
  render(
    <TablePrintDialog
      columns={testColumns}
      rows={rowFactory}
      rowCount={testRows.length}
      filters={["School: Enchantment"]}
      sort="Name, descending"
      deckName="Named deck"
      onColumns={vi.fn()}
    />,
  );
  expect(rowFactory).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Print table" }));
  const dialog = within(screen.getByRole("dialog", { name: "Table print preview" }));
  const info = dialog.getByRole("button", { name: "Printing instructions" });
  const help = () => dialog.queryByText(/use the selected paper and orientation/);
  expect(info).toHaveAttribute("aria-expanded", "false");
  expect(help()).toBeNull();
  await user.click(info);
  expect(info).toHaveAttribute("aria-expanded", "true");
  expect(help()).toBeVisible();
  await user.click(info);
  expect(info).toHaveAttribute("aria-expanded", "false");
  expect(dialog.getByText("School: Enchantment")).toBeVisible();
  expect(dialog.getByText("Name, descending")).toBeVisible();
  await user.selectOptions(dialog.getByLabelText("Paper size"), "A4");
  await user.selectOptions(dialog.getByLabelText("Orientation"), "landscape");
  const sheets = await dialog.findAllByRole("table");
  expect(sheets).toHaveLength(2);
  for (const sheet of sheets) {
    expect(
      within(sheet)
        .getAllByRole("columnheader")
        .map((heading) => heading.textContent),
    ).toEqual(["Name", "Description"]);
  }
  expect(dialog.getByText("Complete description 1")).toBeVisible();
  await user.click(dialog.getByRole("button", { name: "Print table" }));
  await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  expect(document.title).toBe("Named deck");
  const output = document.body.querySelector(".table-print-output");
  expect(output?.querySelector("style")?.textContent).toContain("A4 landscape");
  expect(output?.querySelectorAll("table")).toHaveLength(2);
  expect(output?.querySelectorAll("tbody th")[0].textContent).toBe("Bless");
  await act(async () => window.dispatchEvent(new Event("afterprint")));
  expect(document.title).toBe(previousTitle);
  expect(document.body.querySelector(".table-print-output")).toBeNull();
});

it("disables printing for empty results and shows a localized warning when the layout cannot fit", async () => {
  const user = userEvent.setup();
  await i18n.changeLanguage("de");
  vi.mocked(measureTablePrint).mockReturnValue(null);
  const onColumns = vi.fn();
  const props = {
    columns: testColumns,
    rows: () => testRows,
    filters: [],
    sort: "Stapelreihenfolge",
    deckName: "",
    onColumns,
  };
  const { rerender } = render(<TablePrintDialog {...props} rowCount={0} />);
  const trigger = screen.getByRole("button", { name: "Tabelle drucken" });
  expect(trigger).toBeDisabled();
  expect(trigger).toHaveAccessibleDescription("Keine passenden Einträge zum Drucken.");
  rerender(<TablePrintDialog {...props} rowCount={testRows.length} />);
  await user.click(trigger);
  const dialog = within(screen.getByRole("dialog", { name: "Tabellen-Druckvorschau" }));
  expect(dialog.getByLabelText("Papierformat")).toHaveValue("A4");
  expect(await dialog.findByRole("alert")).toHaveTextContent("6 pt");
  expect(dialog.getByRole("button", { name: "Tabelle drucken" })).toBeDisabled();
  await user.click(dialog.getByRole("button", { name: "Sichtbare Spalten ändern" }));
  await waitFor(() => expect(onColumns).toHaveBeenCalledOnce());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
