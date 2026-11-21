import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Download, Info, Menu, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import { backupFailure, exportCompleteBackup } from "@/io/complete-backup.ts";
import { translateMessage } from "@/locales/messages.ts";
import { Button } from "@/ui/Button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/ui/DropdownMenu.tsx";
import { AboutDialog } from "./AboutDialog.tsx";
import { CustomSpellsGuideDialog } from "./CustomSpellsGuideDialog.tsx";
import { PrivacyDialog } from "./PrivacyDialog.tsx";
import { RestoreBackupDialog } from "./import-export/RestoreBackupDialog.tsx";

export function HeaderMenu() {
  const { t } = useTranslation();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const exporting = useRef(false);

  const exportBackup = async () => {
    if (exporting.current) return;
    exporting.current = true;
    try {
      await exportCompleteBackup();
      toast.success(t("backup.exported"));
    } catch (error) {
      toast.error(translateMessage(t, backupFailure(error, "backup.exportFailed")));
    } finally {
      exporting.current = false;
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("menu.triggerAria")}
            data-collection-menu=""
          >
            <Menu size={18} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48" data-collection-menu="">
          <DropdownMenuItem onSelect={() => void exportBackup()}>
            <Download size={16} aria-hidden="true" />
            {t("backup.export")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRestoreOpen(true)}>
            <Upload size={16} aria-hidden="true" />
            {t("backup.restore")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setAboutOpen(true)}>
            <Info size={16} aria-hidden="true" />
            {t("menu.aboutApp")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setGuideOpen(true)}>
            <BookOpen size={16} aria-hidden="true" />
            {t("menu.customSpellsGuide")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPrivacyOpen(true)}>
            <ShieldCheck size={16} aria-hidden="true" />
            {t("menu.privacyPolicy")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      <CustomSpellsGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
      <PrivacyDialog open={privacyOpen} onOpenChange={setPrivacyOpen} />
      {restoreOpen ? <RestoreBackupDialog onClose={() => setRestoreOpen(false)} /> : null}
    </>
  );
}
