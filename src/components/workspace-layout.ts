import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";

export const WORKSPACE_THRESHOLDS = { split: 720, wide: 1200 } as const;
export type WorkspaceMode = "compact" | "split" | "wide";
export const WorkspaceLayoutContext = createContext<WorkspaceMode>("wide");
export const ShowDetailsContext = createContext<() => void>(() => {});
export const useWorkspaceMode = () => useContext(WorkspaceLayoutContext);
export function modeForWidth(width: number): WorkspaceMode {
  return width >= WORKSPACE_THRESHOLDS.wide
    ? "wide"
    : width >= WORKSPACE_THRESHOLDS.split
      ? "split"
      : "compact";
}

export function useWorkspaceLayout() {
  const ref = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<WorkspaceMode>("compact");
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setMode(modeForWidth(element.getBoundingClientRect().width));
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((item) => item.target === element);
      if (entry)
        setMode(modeForWidth(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, mode };
}
