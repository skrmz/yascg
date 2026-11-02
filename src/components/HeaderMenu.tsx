import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Info, Menu } from "lucide-react";
import { Button } from "@/ui/Button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/DropdownMenu.tsx";
import { AboutDialog } from "./AboutDialog.tsx";
import { CustomSpellsGuideDialog } from "./CustomSpellsGuideDialog.tsx";

export function HeaderMenu() {
  const { t } = useTranslation();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("menu.triggerAria")}>
            <Menu size={18} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onSelect={() => setAboutOpen(true)}>
            <Info size={16} aria-hidden="true" />
            {t("menu.aboutApp")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setGuideOpen(true)}>
            <BookOpen size={16} aria-hidden="true" />
            {t("menu.customSpellsGuide")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      <CustomSpellsGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </>
  );
}
