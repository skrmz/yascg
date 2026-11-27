import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NativeSelect } from "@/ui/Field.tsx";

export type PreviewScaleMode = "physical" | "fit";

interface PreviewFrameProps {
  mode: PreviewScaleMode;
  children: ReactNode[];
}

/** Transform only screen cards; the inner physical card and fit inputs stay unchanged. */
export function PreviewFrame({ mode, children }: PreviewFrameProps) {
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
  );
}

export function PreviewScale({
  mode,
  onModeChange,
}: {
  mode: PreviewScaleMode;
  onModeChange: (mode: PreviewScaleMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <NativeSelect
      name="previewScale"
      aria-label={t("details.previewScale")}
      className="h-8 w-auto max-w-[52%] min-w-0"
      value={mode}
      onChange={(event) => onModeChange(event.target.value as PreviewScaleMode)}
    >
      <option value="physical">{t("details.previewPhysical")}</option>
      <option value="fit">{t("details.previewFit")}</option>
    </NativeSelect>
  );
}
