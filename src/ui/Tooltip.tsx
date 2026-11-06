import { useRef, useState, type ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "./cn.ts";

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  label,
  children,
  contentClassName,
  touchable = false,
}: {
  label: string;
  children: ReactNode;
  contentClassName?: string;
  /** Toggle the tooltip on tap in addition to hover/focus, for touch devices. */
  touchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const touchWasOpenRef = useRef(false);
  const touchClickRef = useRef(false);

  return (
    <TooltipPrimitive.Root
      open={touchable ? open : undefined}
      onOpenChange={touchable ? setOpen : undefined}
    >
      <TooltipPrimitive.Trigger
        asChild
        onPointerDown={
          touchable
            ? (event) => {
                if (event.pointerType !== "touch") {
                  touchClickRef.current = false;
                  return;
                }
                touchWasOpenRef.current = open;
                touchClickRef.current = true;
              }
            : undefined
        }
        onPointerUp={
          touchable
            ? (event) => {
                if (event.pointerType !== "touch") return;
                if (!touchWasOpenRef.current) setOpen(true);
              }
            : undefined
        }
        onClick={
          touchable
            ? (event) => {
                if (!touchClickRef.current) return;
                event.preventDefault();
                touchClickRef.current = false;
              }
            : undefined
        }
      >
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className={cn(
            "app-no-print pointer-events-none z-50 rounded bg-primary px-2 py-1 text-xs text-primary-foreground shadow",
            contentClassName,
          )}
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-primary" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
