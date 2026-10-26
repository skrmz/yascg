import { useTranslation } from "react-i18next";
import { LEVEL_MAX, LEVEL_MIN, type LevelRange } from "@/services/data/search.ts";
import { Slider } from "@/ui/Slider.tsx";

export function LevelRangeSlider({
  value,
  onChange,
}: {
  value: LevelRange;
  onChange: (next: LevelRange) => void;
}) {
  const { t } = useTranslation();
  const label =
    value.min === value.max
      ? t("library.levelSingle", { level: value.min })
      : t("library.levelRange", { min: value.min, max: value.max });
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <Slider
        min={LEVEL_MIN}
        max={LEVEL_MAX}
        step={1}
        value={[value.min, value.max]}
        onValueChange={([min, max]) => onChange({ min, max })}
        thumbLabel={(level) => String(level)}
        thumbAriaLabel={(index) =>
          index === 0 ? t("library.minimumLevel") : t("library.maximumLevel")
        }
        aria-label={t("library.levelRangeAria")}
      />
    </div>
  );
}
