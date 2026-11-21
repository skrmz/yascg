import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BackgroundImageError, preparePersonalBackground } from "@/cards/personal-backgrounds.ts";
import { addPersonalBackground, removePersonalBackground } from "@/db/personal-backgrounds.ts";
import { AppError, translateMessage } from "@/locales/messages.ts";
import { useApp } from "@/state/AppProvider.tsx";
import { Button } from "@/ui/Button.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";

export function PersonalBackgroundsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { personalBackgrounds, collectionGeneration, refreshAll } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Array<{ name: string; reason: string }>>([]);

  const errorText = (error: unknown, fallback: "storageFailed" | "unsuitable") => {
    if (error instanceof AppError) return translateMessage(t, error.descriptor);
    if (error instanceof BackgroundImageError) return t(`card.background.${error.reason}`);
    return t(`card.background.${fallback}`);
  };

  const run = async (task: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setErrors([]);
    try {
      await task();
    } finally {
      refreshAll();
      pending.current = false;
      setBusy(false);
    }
  };

  const importFiles = (files: File[]) =>
    run(async () => {
      for (const file of files) {
        const background = await preparePersonalBackground(file).catch((error: unknown) => {
          setErrors((previous) => [
            ...previous,
            { name: file.name, reason: errorText(error, "unsuitable") },
          ]);
          return null;
        });
        if (!background) continue;
        try {
          await addPersonalBackground(background, collectionGeneration);
        } catch (error) {
          setErrors((previous) => [
            ...previous,
            { name: file.name, reason: errorText(error, "storageFailed") },
          ]);
        }
      }
    });

  const close = () => {
    if (!pending.current) onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        title={t("card.background.manage")}
        description={t("card.background.importHelp")}
        footer={
          <Button variant="outline" disabled={busy} onClick={close}>
            {t("common.close")}
          </Button>
        }
      >
        <div className="space-y-3">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length) void importFiles(files);
            }}
          />
          <Button
            variant="outline"
            disabled={busy || !collectionGeneration}
            onClick={() => input.current?.click()}
          >
            {t("card.background.chooseImages")}
          </Button>
          {busy && <p role="status">{t("card.background.processing")}</p>}
          {errors.length > 0 && (
            <ul
              role="alert"
              className="space-y-1 break-words rounded border border-red-500/30 bg-red-500/10 p-2 text-red-300"
            >
              {errors.map(({ name, reason }, index) => (
                <li key={index}>
                  <strong>{name}</strong> · {reason}
                </li>
              ))}
            </ul>
          )}
          <ul className="divide-y divide-border">
            {personalBackgrounds.map(({ id, name }) => (
              <li key={id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 break-words">{name}</span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t("card.background.removeImage", { name })}
                  disabled={busy || !collectionGeneration}
                  onClick={() =>
                    void run(async () => {
                      try {
                        await removePersonalBackground(id, collectionGeneration);
                      } catch (error) {
                        setErrors([{ name, reason: errorText(error, "storageFailed") }]);
                      }
                    })
                  }
                >
                  {t("card.background.remove")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
