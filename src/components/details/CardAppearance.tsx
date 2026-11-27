import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp } from "@/state/AppProvider.tsx";
import { CARD_DESIGN_LABEL_KEYS, CARD_DESIGNS, type CardDesign } from "@/cards/design.ts";
import {
  CARD_BACKGROUND_NONE,
  CARD_BACKGROUNDS,
  cardBackgroundId,
  cardBackgroundLabel,
} from "@/cards/backgrounds.ts";
import { AppError, translateMessage } from "@/locales/messages.ts";
import { Button } from "@/ui/Button.tsx";
import { Label, NativeSelect } from "@/ui/Field.tsx";
import { CardLegendDialog } from "../deck/CardLegendDialog.tsx";
import { PersonalBackgroundsDialog } from "../deck/PersonalBackgroundsDialog.tsx";

export function CardAppearance({ openRequest = 0 }: { openRequest?: number }) {
  const { t } = useTranslation();
  const {
    cardDesign,
    setCardDesign,
    cardBackground,
    setCardBackground,
    personalBackgrounds,
    collectionGeneration,
  } = useApp();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const handledRequest = useRef(0);

  useEffect(() => {
    if (!openRequest || handledRequest.current === openRequest) return;
    const frame = requestAnimationFrame(() => {
      if (!disclosure.current) return;
      handledRequest.current = openRequest;
      disclosure.current.open = true;
      summary.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [openRequest]);

  const [legendOpen, setLegendOpen] = useState(false);
  const [backgroundsOpen, setBackgroundsOpen] = useState(false);
  const [backgroundBusy, setBackgroundBusy] = useState(false);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);

  const chooseBackground = async (id: string) => {
    setBackgroundError(null);
    setBackgroundBusy(true);
    try {
      await setCardBackground(id);
    } catch (error) {
      setBackgroundError(
        error instanceof AppError
          ? translateMessage(t, error.descriptor)
          : t("card.background.storageFailed"),
      );
    } finally {
      setBackgroundBusy(false);
    }
  };

  const backgroundIds = [
    CARD_BACKGROUND_NONE,
    ...CARD_BACKGROUNDS.map((option) => option.id),
    ...personalBackgrounds.map(({ id }) => id),
  ];
  const currentBackgroundId = cardBackgroundId(cardBackground);
  const canCycleBackground = backgroundIds.length > 1;
  const cycleBackground = (step: 1 | -1) => {
    if (!canCycleBackground) return;
    const index = backgroundIds.indexOf(currentBackgroundId);
    const nextIndex =
      index === -1
        ? step === 1
          ? 0
          : backgroundIds.length - 1
        : (index + step + backgroundIds.length) % backgroundIds.length;
    void chooseBackground(backgroundIds[nextIndex]);
  };

  return (
    <>
      <details ref={disclosure} className="app-no-print border-t border-border">
        <summary
          ref={summary}
          className="cursor-pointer content-center rounded px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          {t("card.appearance")}
        </summary>
        <div className="space-y-2 px-3 pb-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 basis-32">
              <Label htmlFor="card-design-select">{t("card.design.label")}</Label>
              <NativeSelect
                id="card-design-select"
                value={cardDesign}
                className="mt-1 h-8"
                onChange={(event) => setCardDesign(event.target.value as CardDesign)}
              >
                {CARD_DESIGNS.map((design) => (
                  <option key={design} value={design}>
                    {t(CARD_DESIGN_LABEL_KEYS[design])}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button size="sm" variant="outline" onClick={() => setLegendOpen(true)}>
              {t("card.design.legend")}
            </Button>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <Label htmlFor="card-background-select">{t("card.background.label")}</Label>
                <NativeSelect
                  id="card-background-select"
                  value={cardBackgroundId(cardBackground)}
                  className="mt-1 h-8"
                  disabled={backgroundBusy || !collectionGeneration}
                  onChange={(event) => void chooseBackground(event.target.value)}
                >
                  <option value={CARD_BACKGROUND_NONE}>{t("card.background.none")}</option>
                  {CARD_BACKGROUNDS.map((option) => (
                    <option key={option.id} value={option.id} title={option.id}>
                      {cardBackgroundLabel(option.id)}
                    </option>
                  ))}
                  {personalBackgrounds.length > 0 && (
                    <optgroup label={t("card.background.personal")}>
                      {personalBackgrounds.map(({ id, name }) => (
                        <option key={id} value={id} title={name}>
                          {t("card.background.personalOption", { name: cardBackgroundLabel(name) })}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </NativeSelect>
              </div>
              {canCycleBackground ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label={t("card.background.previous")}
                    aria-controls="card-background-select"
                    disabled={backgroundBusy || !collectionGeneration}
                    onClick={() => cycleBackground(-1)}
                  >
                    <ChevronLeft size={14} aria-hidden="true" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label={t("card.background.next")}
                    aria-controls="card-background-select"
                    disabled={backgroundBusy || !collectionGeneration}
                    onClick={() => cycleBackground(1)}
                  >
                    <ChevronRight size={14} aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                disabled={backgroundBusy || !collectionGeneration}
                onClick={() => setBackgroundsOpen(true)}
              >
                {t("card.background.useOwn")}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("card.background.hint")}</p>
        </div>
      </details>
      {backgroundError && (
        <p role="alert" className="mt-1 px-3 text-xs text-red-300">
          {backgroundError}
        </p>
      )}
      {backgroundsOpen && <PersonalBackgroundsDialog onClose={() => setBackgroundsOpen(false)} />}
      <CardLegendDialog open={legendOpen} onOpenChange={setLegendOpen} />
    </>
  );
}
