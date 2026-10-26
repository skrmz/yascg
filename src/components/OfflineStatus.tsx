import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloudOff, RefreshCw, Wifi } from "lucide-react";
import { useApp } from "@/state/AppProvider.tsx";
import { setupOffline, verifyOfflineAssets, type OfflineState } from "@/pwa/register.ts";
import { Button } from "@/ui/Button.tsx";

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

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
      {state.status === "ready" ? (
        <Wifi size={14} className="text-emerald-300" aria-hidden="true" />
      ) : (
        <CloudOff size={14} className="text-amber-300" aria-hidden="true" />
      )}
      <span aria-live="polite">{label}</span>
      {state.status === "incomplete" ? (
        <Button variant="outline" size="sm" onClick={retry} aria-label={t("offline.retryAria")}>
          <RefreshCw size={12} aria-hidden="true" />
          {t("offline.retry")}
        </Button>
      ) : null}
      {applyUpdate ? (
        <Button variant="secondary" size="sm" onClick={() => applyUpdate()}>
          {t("offline.updateAvailable")}
        </Button>
      ) : null}
    </div>
  );
}
