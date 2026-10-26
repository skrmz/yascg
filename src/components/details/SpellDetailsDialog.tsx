import { useTranslation } from "react-i18next";
import type { Spell } from "@/domain/spells";
import { resolveContentLanguage } from "@/content-language.ts";
import { levelLabelKey, schoolKey } from "@/locales/labels.ts";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import { SpellDetailsContent } from "./SpellDetailsContent.tsx";

export interface SpellDetailsDialogProps {
  spell: Spell;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  datasetLanguage?: string;
}

export function SpellDetailsDialog({
  spell,
  open,
  onOpenChange,
  datasetLanguage,
}: SpellDetailsDialogProps) {
  const { t } = useTranslation();
  const levelLabel = t(levelLabelKey(spell.level), { level: spell.level });
  const contentLanguage = datasetLanguage
    ? resolveContentLanguage(spell, datasetLanguage)
    : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={spell.name}
        titleLang={contentLanguage}
        description={`${levelLabel} \u00b7 ${t(schoolKey(spell.school))}`}
        closeLabel={t("details.close")}
        className="app-no-print flex max-h-[85vh] w-[min(94vw,48rem)] flex-col overflow-hidden"
        bodyClassName="min-h-0 overflow-y-auto pr-1"
      >
        <SpellDetailsContent spell={spell} datasetLanguage={datasetLanguage} />
      </DialogContent>
    </Dialog>
  );
}
