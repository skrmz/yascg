import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { useApp } from "@/state/AppProvider.tsx";
import type { SavedDeck } from "@/domain/deck";
import { translateMessage } from "@/locales/messages.ts";
import { Button } from "@/ui/Button.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";

export function OpenDeckDialog({
  open,
  onOpenChange,
  dirty,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dirty: boolean;
}) {
  const { savedDecks, openSavedDeck, deleteSavedDeck, deckBusy } = useApp();
  const { t, i18n } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState<SavedDeck | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedDeck | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmOpen(null);
    setDeleteTarget(null);
    setError(null);
  }, [open]);

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const deck of savedDecks) {
      counts.set(deck.name, (counts.get(deck.name) ?? 0) + 1);
    }
    return counts;
  }, [savedDecks]);

  const runOpen = async (deck: SavedDeck) => {
    const outcome = await openSavedDeck(deck.id);
    if (outcome.status === "ok" || outcome.status === "unchanged") {
      setConfirmOpen(null);
      onOpenChange(false);
      return;
    }
    setConfirmOpen(null);
    if (
      outcome.status === "invalid" ||
      outcome.status === "conflict" ||
      outcome.status === "error"
    ) {
      setError(translateMessage(t, outcome.message));
    }
  };

  const requestOpen = (deck: SavedDeck) => {
    setError(null);
    if (dirty) {
      setConfirmOpen(deck);
      return;
    }
    void runOpen(deck);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const outcome = await deleteSavedDeck(deleteTarget.id, deleteTarget.revision);
    if (outcome.status === "ok") {
      setDeleteTarget(null);
      setError(null);
      return;
    }
    setDeleteTarget(null);
    if (
      outcome.status === "invalid" ||
      outcome.status === "conflict" ||
      outcome.status === "error"
    ) {
      setError(translateMessage(t, outcome.message));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          title={t("deck.openTitle")}
          description={t("deck.openDescription")}
          className="w-[min(92vw,40rem)]"
          footer={
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.close")}
            </Button>
          }
        >
          {savedDecks.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("deck.openEmpty")}</p>
          ) : (
            <ul className="max-h-[55vh] space-y-1.5 overflow-auto">
              {savedDecks.map((deck) => (
                <li
                  key={deck.id}
                  className="flex flex-wrap items-center gap-2 rounded border border-border p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{deck.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {new Date(deck.updatedAt).toLocaleString(i18n.resolvedLanguage)}
                      {(duplicateNames.get(deck.name) ?? 0) > 1
                        ? ` · ${t("deck.duplicateId", { id: deck.id.slice(0, 8) })}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={t("deck.openAria", { name: deck.name })}
                    onClick={() => requestOpen(deck)}
                    disabled={deckBusy}
                  >
                    {t("deck.open")}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("deck.deleteAria", { name: deck.name })}
                    onClick={() => setDeleteTarget(deck)}
                    disabled={deckBusy}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {error ? (
            <p
              role="alert"
              className="mt-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300"
            >
              {error}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen !== null} onOpenChange={(next) => !next && setConfirmOpen(null)}>
        <DialogContent
          title={t("deck.openConfirmTitle")}
          description={t("deck.openConfirmDescription")}
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirmOpen(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={deckBusy}
                onClick={() => {
                  if (confirmOpen) void runOpen(confirmOpen);
                }}
              >
                {t("deck.openConfirm")}
              </Button>
            </>
          }
        />
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(next) => !next && setDeleteTarget(null)}>
        <DialogContent
          title={t("deck.deleteTitle")}
          description={t("deck.deleteDescription")}
          footer={
            <>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                disabled={deckBusy}
                onClick={() => void confirmDelete()}
              >
                {t("deck.deleteConfirm")}
              </Button>
            </>
          }
        />
      </Dialog>
    </>
  );
}
