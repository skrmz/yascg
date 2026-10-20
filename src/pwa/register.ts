import { registerSW } from "virtual:pwa-register";

export type OfflineState =
  | { status: "idle" }
  | { status: "setting-up" }
  | { status: "ready"; missing: string[] }
  | { status: "incomplete"; missing: string[] };

export interface OfflineAssetReport {
  complete: boolean;
  missing: string[];
}

const REQUIRED_SHELL = ["/index.html", "/spell-languages.json"];

function cachedUrls(cachesList: readonly Cache[]): Promise<string[]> {
  return Promise.all(cachesList.map((cache) => cache.keys())).then((requests) =>
    requests.flat().map((request) => new URL(request.url).pathname),
  );
}

/**
 * Verifies that the shell, manifest, every bundled dataset, and at least one
 * local font are present in Cache Storage. Offline readiness is never claimed
 * from service-worker registration alone.
 */
export async function verifyOfflineAssets(
  datasets: readonly string[],
): Promise<OfflineAssetReport> {
  if (typeof caches === "undefined") {
    return { complete: false, missing: [...REQUIRED_SHELL, ...datasets, "fonts"] };
  }
  const names = await caches.keys();
  const cachesList = await Promise.all(names.map((name) => caches.open(name)));
  const urls = new Set(await cachedUrls(cachesList));
  const missing: string[] = [];
  for (const required of [...REQUIRED_SHELL, ...datasets]) {
    if (!urls.has(required)) missing.push(required);
  }
  const hasFont = [...urls].some(
    (url) => url.endsWith(".woff2") || url.endsWith(".woff") || url.endsWith(".ttf"),
  );
  if (!hasFont) missing.push("fonts");
  return { complete: missing.length === 0, missing };
}

export interface OfflineSetup {
  updateServiceWorker: (reload?: boolean) => Promise<void>;
}

export function setupOffline(options: {
  onUpdateReady: (apply: () => void) => void;
}): OfflineSetup {
  const updateSW = registerSW({
    onNeedRefresh() {
      options.onUpdateReady(() => {
        void updateSW(true);
      });
    },
  });
  return { updateServiceWorker: (reload) => updateSW(reload) };
}
