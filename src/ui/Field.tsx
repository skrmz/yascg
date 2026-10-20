import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
} from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "./cn.ts";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-md border border-input bg-background p-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        className,
      )}
      {...props}
    />
  );
});

export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function NativeSelect({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);

export function Label({
  children,
  htmlFor,
  className,
}: {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <LabelPrimitive.Root
      htmlFor={htmlFor}
      className={cn("block text-xs font-medium text-muted-foreground", className)}
    >
      {children}
    </LabelPrimitive.Root>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-red-300">{children}</p>;
}
