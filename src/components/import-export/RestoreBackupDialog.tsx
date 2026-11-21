import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "@/state/AppProvider.tsx";
import { readCollectionSnapshot } from "@/db/collection-state.ts";
import { publishChange } from "@/db/notifications.ts";
import {
  backupFailure,
  BackupCompatibilityError,
  reviewCompleteBackup,
  type RestoreReview,
} from "@/io/complete-backup.ts";
import { message, type MessageDescriptor } from "@/locales/messages.ts";
import { Button } from "@/ui/Button.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import { FileInput, NoticeBanner } from "./shared.tsx";

export function RestoreBackupDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { refreshAll } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const reviewRequest = useRef(0);
  const committing = useRef(false);
  const reviewRef = useRef<RestoreReview | null>(null);
  const [review, setReview] = useState<RestoreReview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<MessageDescriptor[]>([]);
  const [result, setResult] = useState<"committed" | "reload" | null>(null);

  const clearReview = () => {
    reviewRef.current = null;
    setReview(null);
  };

  const close = () => {
    if (committing.current) return;
    reviewRequest.current += 1;
    clearReview();
    onClose();
  };

  const reviewFile = async (selected: File) => {
    if (committing.current) return;
    const request = ++reviewRequest.current;
    clearReview();
    setFile(selected);
    setBusy(true);
    setErrors([]);
    try {
      const validated = await reviewCompleteBackup(await selected.text());
      if (request === reviewRequest.current) {
        reviewRef.current = validated;
        setReview(validated);
      }
    } catch (error) {
      if (request === reviewRequest.current) {
        setErrors([
          backupFailure(error, "backup.readFailed"),
          ...(error instanceof BackupCompatibilityError ? error.issues : []),
        ]);
      }
    } finally {
      if (request === reviewRequest.current) setBusy(false);
    }
  };

  const confirm = async () => {
    const reviewed = reviewRef.current;
    if (!reviewed || committing.current) return;
    committing.current = true;
    clearReview();
    setBusy(true);
    try {
      await reviewed.commit();
      publishChange("collection");
      try {
        await readCollectionSnapshot();
        refreshAll();
        setResult("committed");
      } catch {
        setResult("reload");
      }
    } catch (error) {
      setErrors([backupFailure(error, "backup.restoreFailed")]);
    } finally {
      committing.current = false;
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        title={t("backup.restore")}
        description={t("backup.restoreDescription")}
        footer={
          <>
            <Button variant="outline" disabled={busy && committing.current} onClick={close}>
              {t(result ? "common.close" : "common.cancel")}
            </Button>
            {result === "reload" ? (
              <Button onClick={() => window.location.reload()}>{t("app.conflict.reload")}</Button>
            ) : null}
            {review ? (
              <Button variant="destructive" onClick={() => void confirm()}>
                {t("backup.confirmRestore")}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="space-y-3 break-words">
          {!result ? (
            <div className="flex flex-wrap items-center gap-2">
              <FileInput inputRef={inputRef} onFile={(selected) => void reviewFile(selected)} />
              <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
                {t("backup.chooseFile")}
              </Button>
              {file && errors.length > 0 ? (
                <Button variant="outline" disabled={busy} onClick={() => void reviewFile(file)}>
                  {t("backup.reviewAgain")}
                </Button>
              ) : null}
            </div>
          ) : null}
          {busy ? (
            <p role="status">{t(committing.current ? "backup.restoring" : "backup.validating")}</p>
          ) : null}
          {errors.length > 0 ? <NoticeBanner notice={{ tone: "error", texts: errors }} /> : null}
          {review ? (
            <>
              <p>{file?.name}</p>
              <ul className="list-disc pl-5">
                <li>
                  {t("backup.activeDeck", {
                    name: review.activeName || t("backup.unnamedDeck"),
                    count: review.activeEntries,
                  })}
                </li>
                <li>{t("backup.savedDecks", { count: review.savedDecks })}</li>
                <li>{t("backup.customSpells", { count: review.customSpells })}</li>
                <li>{t("backup.overrides", { count: review.overrides })}</li>
                <li>{t("backup.personalBackgrounds", { count: review.personalBackgrounds })}</li>
              </ul>
              <p role="alert" className="rounded border border-amber-400/30 bg-amber-400/10 p-2">
                {t("backup.replacementWarning")}
                {review.removesPersonalBackgrounds && <> {t("backup.legacyBackgroundWarning")}</>}
              </p>
            </>
          ) : null}
          {result ? (
            <NoticeBanner
              notice={{
                tone: result === "committed" ? "ok" : "error",
                texts: [
                  message(result === "committed" ? "backup.restored" : "backup.reloadAfterCommit"),
                ],
              }}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
