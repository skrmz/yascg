import { HeaderMenu } from "./HeaderMenu.tsx";
import { LanguagePicker } from "./LanguagePicker.tsx";
import { OfflineStatus } from "./OfflineStatus.tsx";

const APP_NAME = "YASCG - Yet Another Spell Card Generator";

export function Header() {
  return (
    <header className="app-no-print flex flex-nowrap items-center justify-between gap-2 border-b border-border bg-card px-3 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] min-[1200px]:gap-3 min-[1200px]:px-4 min-[1200px]:pb-2.5 min-[1200px]:pt-[calc(env(safe-area-inset-top)+0.625rem)]">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="header-app-title min-w-0 truncate" aria-label={APP_NAME}>
          <span className="min-[1200px]:hidden">YASCG</span>
          <span className="hidden min-[1200px]:inline">{APP_NAME}</span>
        </h1>
      </div>
      <div className="flex shrink-0 flex-nowrap items-center gap-2 min-[1200px]:gap-3">
        <OfflineStatus />
        <LanguagePicker />
        <HeaderMenu />
      </div>
    </header>
  );
}
