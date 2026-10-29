import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useApp } from "@/state/AppProvider.tsx";
import { translateMessage } from "@/locales/messages.ts";
import { Button } from "@/ui/Button.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import { Input, Label } from "@/ui/Field.tsx";

export function SaveAsDialog({
  open,
  onOpenChange,
  defaultName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  onSaved?: () => void;
}) {
  const { saveDeckAs, deckBusy } = useApp();
  const { t } = useTranslation();
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setError(null);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open, defaultName]);

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 120) {
      setError(t("deck.nameInvalid"));
      return;
    }
    const outcome = await saveDeckAs(trimmed);
    if (outcome.status === "ok") {
      onSaved?.();
      onOpenChange(false);
      return;
    }
    if (
      outcome.status === "invalid" ||
      outcome.status === "conflict" ||
      outcome.status === "error"
    ) {
      setError(translateMessage(t, outcome.message));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t("deck.saveAsTitle")}
        description={t("deck.saveAsDescription")}
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void submit()} disabled={deckBusy}>
              {t("deck.saveAsConfirm")}
            </Button>
          </>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="save-as-name">{t("deck.nameLabel")}</Label>
          <Input
            ref={inputRef}
            id="save-as-name"
            value={name}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "save-as-error" : undefined}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
          />
          {error ? (
            <p id="save-as-error" role="alert" className="text-xs text-red-300">
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
