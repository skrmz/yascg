import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toUiLocale } from "@/i18n.ts";
import { LEGAL_CONFIG } from "@/legal/config.ts";
import { parseMarkdown } from "@/markdown/parse.ts";
import { BlockList } from "@/markdown/render.tsx";
import { Button } from "@/ui/Button.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import enPolicy from "../../docs/privacy-policy.md?raw";
import dePolicy from "../../docs/privacy-policy.de.md?raw";

const POLICIES = { en: enPolicy, de: dePolicy } as const;

function interpolatePolicy(source: string): string {
  return source
    .replaceAll("{{controllerName}}", LEGAL_CONFIG.controllerName)
    .replaceAll("{{controllerEmail}}", LEGAL_CONFIG.controllerEmail)
    .replaceAll("{{lastUpdated}}", LEGAL_CONFIG.lastUpdated);
}

export function PrivacyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = toUiLocale(i18n.resolvedLanguage ?? "en");
  const blocks = useMemo(
    () => parseMarkdown(interpolatePolicy(POLICIES[locale]), { links: "anchor" }),
    [locale],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("privacy.title")}
        className="app-no-print flex max-h-[85vh] w-[min(94vw,56rem)] flex-col overflow-hidden"
        bodyClassName="min-h-0 flex-1 overflow-y-auto pr-1"
        footer={
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.close")}
          </Button>
        }
      >
        <div lang={locale} className="spell-details-content guide-markdown">
          <BlockList blocks={blocks} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
