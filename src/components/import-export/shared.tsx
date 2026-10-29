import { useTranslation } from "react-i18next";
import type { RefObject } from "react";
import { translateMessage, type MessageDescriptor } from "@/locales/messages.ts";
import { Button } from "@/ui/Button.tsx";

export type Notice = { tone: "ok" | "error"; texts: MessageDescriptor[] };

export async function readFileText(file: File): Promise<string> {
  return file.text();
}

export function NoticeBanner({ notice }: { notice: Notice | null }) {
  const { t } = useTranslation();
  if (!notice) return null;
  return (
    <p
      className={
        notice.tone === "ok"
          ? "rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300"
          : "rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300"
      }
      role="status"
    >
      {notice.texts.map((text) => translateMessage(t, text)).join(" ")}
    </p>
  );
}

export function DiscardNotice({
  onKeepReviewing,
  onDiscard,
}: {
  onKeepReviewing: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="space-y-2 rounded border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-300"
      role="alert"
    >
      <p>{t("importExport.discardNotice")}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onKeepReviewing}>
          {t("importExport.keepReviewing")}
        </Button>
        <Button size="sm" variant="destructive" onClick={onDiscard}>
          {t("importExport.discardClose")}
        </Button>
      </div>
    </div>
  );
}

export function FileInput({
  inputRef,
  onFile,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept="application/json,.json"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) onFile(file);
        event.target.value = "";
      }}
    />
  );
}
