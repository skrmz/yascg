import type { ComponentPropsWithoutRef } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "./cn.ts";
import { Tooltip, TooltipProvider } from "./Tooltip.tsx";

export interface SliderProps extends ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  /** Wraps each thumb in a tooltip; receives the thumb value and index. */
  thumbLabel?: (value: number, index: number) => string;
  /** Accessible name for each thumb; Radix does not label thumbs automatically. */
  thumbAriaLabel?: (index: number) => string;
}

export function Slider({ className, thumbLabel, thumbAriaLabel, ...props }: SliderProps) {
  const values = props.value ?? props.defaultValue ?? [];
  return (
    <SliderPrimitive.Root
      className={cn("relative flex w-full touch-none select-none items-center", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      {values.map((value, index) => {
        const thumb = (
          <SliderPrimitive.Thumb
            key={index}
            aria-label={thumbAriaLabel?.(index)}
            className="block h-4 w-4 rounded-full border border-input bg-background shadow transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
          />
        );
        if (!thumbLabel) return thumb;
        return (
          <TooltipProvider key={index} delayDuration={0}>
            <Tooltip label={thumbLabel(value, index)}>{thumb}</Tooltip>
          </TooltipProvider>
        );
      })}
    </SliderPrimitive.Root>
  );
}
