import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NativeSelect } from "@/ui/Field.tsx";

/** Transform only screen cards; the inner physical card and fit inputs stay unchanged. */
export function PreviewFrame({ children }: { children: ReactNode[] }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState("physical");
  const [width, setWidth] = useState(240);
  const frame = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const update = () => {
      if (element.clientWidth > 0) setWidth(element.clientWidth);
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = mode === "fit" ? Math.min(2, width / 240) : 1;
  return (
    <>
      <label className="app-no-print mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {t("details.previewScale")}
        <NativeSelect
          className="h-8 w-auto"
          value={mode}
          onChange={(event) => setMode(event.target.value)}
        >
          <option value="physical">{t("details.previewPhysical")}</option>
          <option value="fit">{t("details.previewFit")}</option>
        </NativeSelect>
      </label>
      <div ref={frame} className="card-preview-frame">
        {children.map((child, index) => (
          <div
            key={index}
            className="screen-preview-slot"
            style={{ width: 240 * scale, height: 336 * scale }}
          >
            <div
              className="screen-preview-transform"
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                width: 240,
                height: 336,
              }}
            >
              {child}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
