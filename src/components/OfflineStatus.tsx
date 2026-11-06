import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloudOff, RefreshCw } from "lucide-react";
import { useApp } from "@/state/AppProvider.tsx";
import { setupOffline, verifyOfflineAssets, type OfflineState } from "@/pwa/register.ts";
import { Button } from "@/ui/Button.tsx";
import { Tooltip } from "@/ui/Tooltip.tsx";

const VERIFY_ATTEMPTS = 40;
const VERIFY_INTERVAL_MS = 500;

export function OfflineStatus() {
  const { manifest } = useApp();
  const { t } = useTranslation();
  const [state, setState] = useState<OfflineState>({ status: "setting-up" });
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null);

  useEffect(() => {
    try {
      setupOffline({
        onUpdateReady: (apply) => setApplyUpdate(() => apply),
      });
    } catch {
      // Service worker registration is unavailable (for example during unit tests).
    }
  }, []);

  const runVerification = useCallback(
    async (cancelled: () => boolean) => {
      const datasets = manifest.map((entry) => entry.dataset);
      try {
        if (typeof navigator !== "undefined" && navigator.serviceWorker) {
          await navigator.serviceWorker.ready;
        }
      } catch {
        // Continue and verify Cache Storage directly.
      }
      for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt += 1) {
        if (cancelled()) return;
        const report = await verifyOfflineAssets(datasets);
        if (cancelled()) return;
        if (report.complete) {
          setState({ status: "ready", missing: [] });
          return;
        }
        setState({ status: "incomplete", missing: report.missing });
        await new Promise((resolve) => setTimeout(resolve, VERIFY_INTERVAL_MS));
      }
    },
    [manifest],
  );

  useEffect(() => {
    if (manifest.length === 0) return;
    let isCancelled = false;
    void runVerification(() => isCancelled);
    return () => {
      isCancelled = true;
    };
  }, [manifest, runVerification]);

  const retry = () => {
    setState({ status: "setting-up" });
    const isCancelled = () => false;
    void runVerification(isCancelled);
  };

  const label =
    state.status === "ready"
      ? t("offline.ready")
      : state.status === "incomplete"
        ? t("offline.incomplete")
        : state.status === "setting-up"
          ? t("offline.settingUp")
          : t("offline.unknown");

  const showStatus = state.status !== "ready";

  return (
    <>
      <span className="sr-only" role="status">
        {label}
      </span>
      {showStatus || applyUpdate ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {showStatus ? (
            <Tooltip label={label} touchable>
              <button
                type="button"
                aria-label={label}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <CloudOff
                  size={14}
                  className={state.status === "incomplete" ? "text-amber-300" : undefined}
                  aria-hidden="true"
                />
              </button>
            </Tooltip>
          ) : null}
          {state.status === "incomplete" ? (
            <Tooltip label={t("offline.retryAria")} touchable>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={retry}
                aria-label={t("offline.retryAria")}
              >
                <RefreshCw size={12} aria-hidden="true" />
              </Button>
            </Tooltip>
          ) : null}
          {applyUpdate ? (
            <Button variant="secondary" size="sm" onClick={() => applyUpdate()}>
              {t("offline.updateAvailable")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
