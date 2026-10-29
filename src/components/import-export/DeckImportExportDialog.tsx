import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useApp } from "@/state/AppProvider.tsx";
import { buildDeckPayload, deckExportFilename, downloadJson } from "@/io/export.ts";
import { analyzeDeckImport, type DeckImportPlan } from "@/io/import-deck.ts";
import { message, type MessageDescriptor } from "@/locales/messages.ts";
import { Button } from "@/ui/Button.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import { DiscardNotice, FileInput, NoticeBanner, readFileText, type Notice } from "./shared.tsx";

export function DeckImportExportDialog({
  open,
  onOpenChange,
  dirty: dirtyOverride,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dirty?: boolean;
}) {
  const { activeDeck, dirty: contextDirty, importDeck } = useApp();
  const dirty = contextDirty || dirtyOverride === true;
  const { t } = useTranslation();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [plan, setPlan] = useState<DeckImportPlan | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const analysisRef = useRef(0);

  const hasPendingImport = plan !== null;

  const resetImport = () => {
    analysisRef.current += 1;
    setPlan(null);
    setConfirmDiscard(false);
    setNotice(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }
    if (hasPendingImport) {
      setConfirmDiscard(true);
      return;
    }
    resetImport();
    onOpenChange(false);
  };

  const discardAndClose = () => {
    resetImport();
    onOpenChange(false);
  };

  const exportDeck = () => {
    if (!activeDeck) return;
    downloadJson(
      deckExportFilename(),
      buildDeckPayload({ name: activeDeck.name, entries: activeDeck.entries }),
    );
    setNotice({ tone: "ok", texts: [message("importExport.exportedDeck")] });
  };

  const onDeckFile = async (file: File) => {
    const requestId = ++analysisRef.current;
    setConfirmDiscard(false);
    const text = await readFileText(file);
    if (requestId !== analysisRef.current) return;
    const analysis = analyzeDeckImport(text);
    if (!analysis.ok) {
      setPlan(null);
      setNotice({ tone: "error", texts: [analysis.error] });
      return;
    }
    setPlan(analysis.plan);
    const texts: MessageDescriptor[] = [
      message("importExport.validatedDeck", { count: analysis.plan.entries.length }),
    ];
    if (analysis.plan.removedDuplicates > 0) {
      texts.push(
        message("importExport.duplicateWillBeRemoved", {
          count: analysis.plan.removedDuplicates,
        }),
      );
    }
    setNotice({ tone: "ok", texts });
  };

  const commitDeck = async () => {
    if (!plan) return;
    setConfirmDiscard(false);
    const outcome = await importDeck(plan);
    if (outcome.status === "ok") {
      toast.success(t("importExport.deckImportedTitle"), {
        description:
          plan.removedDuplicates > 0
            ? t("importExport.deckImportedDescription", { count: plan.removedDuplicates })
            : t("importExport.deckImportedDefault"),
      });
      resetImport();
      onOpenChange(false);
      return;
    }
    if (outcome.status === "conflict") {
      setNotice({
        tone: "error",
        texts: [outcome.message ?? message("error.generic")],
      });
      return;
    }
    if (outcome.status === "invalid" || outcome.status === "error") {
      setNotice({ tone: "error", texts: [outcome.message] });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        title={t("importExport.deckTitle")}
        description={t("importExport.deckDescription")}
        className="w-[min(92vw,44rem)]"
      >
        <div className="space-y-4">
          {confirmDiscard ? (
            <DiscardNotice
              onKeepReviewing={() => setConfirmDiscard(false)}
              onDiscard={discardAndClose}
            />
          ) : null}
          <NoticeBanner notice={notice} />
          <section className="space-y-2 rounded border border-border p-3">
            <p className="rounded border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-300">
              {t("importExport.deckBackupNotice")}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={exportDeck} disabled={!activeDeck}>
                {t("importExport.exportDeck")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={!activeDeck}
              >
                {t("importExport.importDeck")}
              </Button>
              <FileInput inputRef={inputRef} onFile={(file) => void onDeckFile(file)} />
            </div>
            {plan ? (
              <div className="space-y-2 rounded border border-border bg-muted/40 p-2 text-xs">
                <p>
                  {t("importExport.deckPlan", {
                    count: plan.entries.length,
                    name: plan.name ? t("importExport.deckName", { name: plan.name }) : "",
                  })}
                  {plan.removedDuplicates > 0
                    ? ` ${t("importExport.duplicateWillBeRemoved", {
                        count: plan.removedDuplicates,
                      })}`
                    : ""}
                </p>
                {dirty ? (
                  <p
                    className="rounded border border-amber-400/30 bg-amber-400/10 p-2 text-amber-300"
                    role="alert"
                  >
                    {t("importExport.dirtyReplaceWarning")}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="destructive" onClick={() => void commitDeck()}>
                    {t("importExport.replaceActive")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={resetImport}>
                    {t("importExport.resetDeck")}
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
