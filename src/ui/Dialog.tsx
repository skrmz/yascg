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
}) {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <DialogPrimitive.Content
        lang={lang}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card text-card-foreground p-5 shadow-xl max-h-[85vh] overflow-auto",
          className,
        )}
      >
        <div className="mb-3 flex shrink-0 items-start justify-between gap-4">
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
        <div className={cn("text-sm text-foreground", bodyClassName)}>{children}</div>
        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
