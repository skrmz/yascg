import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { Button } from "@/ui/Button.tsx";
import { Dialog, DialogContent, DialogTrigger } from "@/ui/Dialog.tsx";

export const SRD_ATTRIBUTION =
  "This work includes material from the System Reference Document 5.2.1 (\u201cSRD 5.2.1\u201d) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/.";

export function AboutDialog() {
  const { t } = useTranslation();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t("about.triggerAria")}>
          <Info size={16} aria-hidden="true" />
          {t("about.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent title={t("about.title")}>
        <div className="space-y-3">
          <p>{t("about.description")}</p>
          <p
            lang="en"
            className="rounded border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground"
          >
            {SRD_ATTRIBUTION}
          </p>
          <p className="text-xs text-muted-foreground">{t("about.localData")}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
