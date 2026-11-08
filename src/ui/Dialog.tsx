import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "./cn.ts";
import { Button } from "./Button.tsx";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  title,
  description,
  children,
  footer,
  className,
  bodyClassName,
  closeLabel,
  lang,
  titleLang,
  descriptionLang,
  variant = "dialog",
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  closeLabel?: string;
  lang?: string;
  titleLang?: string;
  descriptionLang?: string;
  variant?: "dialog" | "sheet";
}) {
  const { t } = useTranslation();
  const isSheet = variant === "sheet";
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="app-no-print fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Content
        lang={lang}
        className={cn(
          "app-no-print fixed z-50 border border-border bg-card text-card-foreground shadow-xl",
          isSheet
            ? "inset-x-0 bottom-0 flex max-h-[calc(100dvh-var(--app-keyboard-inset,0px)-1rem)] w-full flex-col overflow-hidden rounded-t-xl p-0 pb-[env(safe-area-inset-bottom)]"
            : "left-1/2 top-1/2 w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg p-5 max-h-[85vh] overflow-auto",
          className,
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-start justify-between gap-4",
            isSheet ? "px-4 pb-2 pt-4" : "mb-3",
          )}
        >
          <div className="min-w-0">
            <DialogPrimitive.Title
              lang={titleLang}
              className="break-words text-lg font-semibold text-foreground"
            >
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description
                lang={descriptionLang}
                className="mt-1 break-words text-sm text-muted-foreground"
              >
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon" aria-label={closeLabel ?? t("common.close")}>
              <X size={16} />
            </Button>
          </DialogPrimitive.Close>
        </div>
        <div
          className={cn(
            "text-sm text-foreground",
            isSheet && "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer ? (
          <div
            className={cn(
              "flex flex-wrap items-center justify-end gap-2",
              isSheet ? "shrink-0 border-t border-border px-4 py-3" : "mt-5",
            )}
          >
            {footer}
          </div>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
