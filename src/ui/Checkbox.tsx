import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.ts";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
}

export function Checkbox({ label, className, id, ...props }: CheckboxProps) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <input
        id={id}
        type="checkbox"
        className={cn(
          "h-4 w-4 rounded border-input text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className,
        )}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}
