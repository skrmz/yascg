import type { ReactNode } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "./cn.ts";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  children,
  align = "end",
  className,
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn(
          "z-50 w-64 rounded-md border border-border bg-popover text-popover-foreground p-2 shadow-lg outline-none",
          className,
        )}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
