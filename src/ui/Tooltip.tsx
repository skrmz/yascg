import type { ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "./cn.ts";

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  label,
  children,
  contentClassName,
}: {
  label: string;
  children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className={cn(
            "pointer-events-none z-50 rounded bg-primary px-2 py-1 text-xs text-primary-foreground shadow",
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
