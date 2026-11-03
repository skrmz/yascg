import { useTranslation } from "react-i18next";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";

export const SRD_ATTRIBUTION =
  "This work includes material from the System Reference Document 5.2.1 (\u201cSRD 5.2.1\u201d) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/.";

export function AboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <dl className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <dt className="font-medium text-foreground">Version</dt>
            <dd>{__APP_VERSION__}</dd>
            <dt className="font-medium text-foreground">Commit</dt>
            <dd>
              <code>{__APP_COMMIT__}</code>
            </dd>
          </dl>
        </div>
      </DialogContent>
    </Dialog>
  );
}
