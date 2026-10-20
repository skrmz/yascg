import type { ReactNode } from "react";
import { cn } from "./cn.ts";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "srd" | "custom" | "warning";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-secondary text-secondary-foreground",
    srd: "bg-amber-400/15 text-amber-300",
    custom: "bg-emerald-500/15 text-emerald-300",
    warning: "bg-red-500/15 text-red-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SourceBadge({ source }: { source: "SRD-5.2.1" | "Custom" }) {
  return source === "Custom" ? (
    <Badge tone="custom">Custom</Badge>
  ) : (
    <Badge tone="srd">SRD 5.2.1</Badge>
  );
}
