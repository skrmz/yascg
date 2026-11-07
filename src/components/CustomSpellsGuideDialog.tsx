import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Download } from "lucide-react";
import { toUiLocale, type UiLocale } from "@/i18n.ts";
import { downloadText } from "@/io/export.ts";
import { parseMarkdown } from "@/markdown/parse.ts";
import { BlockList } from "@/markdown/render.tsx";
import { Button } from "@/ui/Button.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import enGuide from "../../docs/custom-spells-guide.md?raw";
import deGuide from "../../docs/custom-spells-guide.de.md?raw";

const GUIDES = { en: enGuide, de: deGuide } as const;

type CopyStatus = "idle" | "copied" | "failed";

function isCustomSpellsExample(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as { type?: unknown } | null;
    return parsed?.type === "custom-spells";
  } catch {
    return false;
  }
}

function GuideCodeBlock({ value, locale }: { value: string; locale: UiLocale }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CopyStatus>("idle");
  const isExample = isCustomSpellsExample(value);

  async function copyCode() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  const statusText =
    status === "copied" ? t("guide.copied") : status === "failed" ? t("guide.copyFailed") : "";

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-end gap-2">
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {statusText}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          aria-label={t("guide.copyCode")}
          title={t("guide.copyCode")}
          onClick={() => void copyCode()}
        >
          {status === "copied" ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Copy size={14} aria-hidden="true" />
          )}
        </Button>
        {isExample ? (
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            aria-label={t("guide.downloadExample")}
            title={t("guide.downloadExample")}
            onClick={() => downloadText(`custom-spell-example-${locale}.json`, value)}
          >
            <Download size={14} aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <pre className="card-pre overflow-x-auto" style={{ whiteSpace: "pre" }}>
        {value}
      </pre>
    </div>
  );
}

export function CustomSpellsGuideDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = toUiLocale(i18n.resolvedLanguage ?? "en");
  const blocks = useMemo(() => parseMarkdown(GUIDES[locale], { links: "anchor" }), [locale]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("guide.title")}
        className="app-no-print flex max-h-[85vh] w-[min(94vw,56rem)] flex-col overflow-hidden"
        bodyClassName="min-h-0 flex-1 overflow-y-auto pr-1"
      >
        <div lang={locale} className="spell-details-content guide-markdown">
          <BlockList
            blocks={blocks}
            renderCode={(value, key) => <GuideCodeBlock key={key} value={value} locale={locale} />}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
