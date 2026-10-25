import { useTranslation } from "react-i18next";
import type { Spell } from "@/domain/spells";
import { levelLabelKey, schoolKey } from "@/locales/labels.ts";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import { SpellDetailsContent } from "./SpellDetailsContent.tsx";

export interface SpellDetailsDialogProps {
  spell: Spell;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SpellDetailsDialog({ spell, open, onOpenChange }: SpellDetailsDialogProps) {
  const { t, i18n } = useTranslation();
  const levelLabel = t(levelLabelKey(spell.level), { level: spell.level });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={spell.name}
        description={`${levelLabel} \u00b7 ${t(schoolKey(spell.school))}`}
        lang={i18n.resolvedLanguage}
        closeLabel={t("details.close")}
        className="app-no-print flex max-h-[85vh] w-[min(94vw,48rem)] flex-col overflow-hidden"
        bodyClassName="min-h-0 overflow-y-auto pr-1"
      >
        <SpellDetailsContent spell={spell} />
      </DialogContent>
    </Dialog>
  );
}
