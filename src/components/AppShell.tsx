import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Eye, Layers, X } from "lucide-react";
import { useApp } from "@/state/AppProvider.tsx";
import { translateMessage } from "@/locales/messages.ts";
import { Header } from "./Header.tsx";
import { SectionErrorBoundary } from "./ErrorBoundary.tsx";
import { LibraryPane } from "./library/LibraryPane.tsx";
import { DetailsPane } from "./details/DetailsPane.tsx";
import { DeckPane } from "./deck/DeckPane.tsx";
import { Button } from "@/ui/Button.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/Tabs.tsx";
import { cn } from "@/ui/cn.ts";
import {
  ShowDetailsContext,
  WorkspaceLayoutContext,
  useWorkspaceLayout,
} from "./workspace-layout.ts";

type PaneKey = "library" | "details" | "deck";

const PANE_CONTENT =
  "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring";

export function AppShell() {
  const {
    selectedSpellId,
    language,
    activeDeck,
    cardDesign,
    cardBackground,
    languageNotice,
    dismissLanguageNotice,
    deckError,
    clearDeckError,
    dataError,
    retryData,
    dismissDataError,
    pendingLanguageSwitch,
    confirmLanguageSwitch,
    cancelLanguageSwitch,
    conflict,
    reloadLatest,
    dismissConflict,
  } = useApp();
  const { t } = useTranslation();

  useEffect(() => {
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", t("app.metaDescription"));
  }, [t]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const updateInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height);
      if (inset > 80) {
        document.documentElement.style.setProperty("--app-keyboard-inset", `${inset}px`);
      } else {
        document.documentElement.style.removeProperty("--app-keyboard-inset");
      }
    };
    updateInset();
    viewport.addEventListener("resize", updateInset);
    viewport.addEventListener("scroll", updateInset);
    return () => {
      viewport.removeEventListener("resize", updateInset);
      viewport.removeEventListener("scroll", updateInset);
      document.documentElement.style.removeProperty("--app-keyboard-inset");
    };
  }, []);

  const [tab, setTab] = useState<PaneKey>("library");
  const [rightTab, setRightTab] = useState<"details" | "deck">("details");
  const { ref: workspaceRef, mode } = useWorkspaceLayout();
  useEffect(() => {
    document.documentElement.dataset.workspaceMode = mode;
    return () => {
      delete document.documentElement.dataset.workspaceMode;
    };
  }, [mode]);
  const changeTab = (value: string) => {
    setTab(value as PaneKey);
    if (value === "details" || value === "deck") setRightTab(value);
  };
  const activeTab = mode === "split" ? rightTab : tab;
  const paneVisible = (pane: PaneKey) =>
    mode === "wide" || (mode === "split" ? pane === "library" || pane === rightTab : pane === tab);
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    if (focused?.closest("[data-workspace-pane][hidden]")) {
      workspaceRef.current
        ?.querySelector<HTMLElement>(`[data-workspace-pane="${activeTab}"]:not([hidden])`)
        ?.focus();
    }
  }, [mode, activeTab, workspaceRef]);
  const previousSelectedSpell = useRef(selectedSpellId);

  useEffect(() => {
    if (selectedSpellId !== null && selectedSpellId !== previousSelectedSpell.current) {
      setTab("details");
      setRightTab("details");
    }
    previousSelectedSpell.current = selectedSpellId;
  }, [selectedSpellId]);

  const notice = languageNotice ?? deckError ?? dataError;

  return (
    <div
      className="app-shell flex flex-col overflow-hidden bg-background text-foreground"
      data-workspace-mode={mode}
      style={{ height: "calc(100dvh - var(--app-keyboard-inset, 0px))" }}
    >
      <Header />
      {notice ? (
        <div className="app-no-print flex flex-wrap items-center justify-between gap-2 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
          <span className="min-w-0 break-words">{translateMessage(t, notice)}</span>
          <div className="flex items-center gap-1">
            {dataError && notice === dataError ? (
              <Button variant="ghost" size="sm" onClick={retryData}>
                {t("common.retry")}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("app.notice.dismiss")}
              onClick={() => {
                if (languageNotice) dismissLanguageNotice();
                if (deckError) clearDeckError();
                if (dataError) dismissDataError();
              }}
            >
              <X size={14} aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
      <ShowDetailsContext.Provider value={() => changeTab("details")}>
        <WorkspaceLayoutContext.Provider value={mode}>
          <main
            ref={workspaceRef}
            data-workspace-mode={mode}
            className="min-h-0 flex-1 overflow-hidden"
          >
            <Tabs
              value={activeTab}
              onValueChange={changeTab}
              className={cn(
                "workspace-panes h-full min-h-0",
                mode === "compact" ? "flex flex-col" : "grid",
              )}
              style={
                mode === "wide"
                  ? {
                      gridTemplateColumns:
                        "clamp(320px,24%,400px) minmax(560px,1fr) clamp(300px,calc(50% - 300px),640px)",
                      gridTemplateRows: "minmax(0,1fr)",
                    }
                  : mode === "split"
                    ? {
                        gridTemplateColumns: "clamp(320px,36%,420px) minmax(400px,1fr)",
                        gridTemplateRows: "auto minmax(0,1fr)",
                      }
                    : undefined
              }
            >
              {mode !== "wide" ? (
                <TabsList
                  aria-label={t("app.workspaceNavigation")}
                  className={cn(
                    "mx-2 mt-2 self-start justify-self-start",
                    mode === "split" && "col-start-2 row-start-1",
                  )}
                >
                  {mode === "compact" ? (
                    <TabsTrigger id="workspace-tab-library" value="library">
                      <BookOpen size={14} aria-hidden="true" />
                      {t("app.tabs.library")}
                    </TabsTrigger>
                  ) : null}
                  <TabsTrigger id="workspace-tab-details" value="details">
                    <Eye size={14} aria-hidden="true" />
                    {t("app.tabs.details")}
                  </TabsTrigger>
                  <TabsTrigger id="workspace-tab-deck" value="deck">
                    <Layers size={14} aria-hidden="true" />
                    {t("app.tabs.deck")}
                  </TabsTrigger>
                </TabsList>
              ) : null}
              <TabsContent
                value="library"
                forceMount
                data-workspace-pane="library"
                hidden={!paneVisible("library")}
                role={mode === "compact" ? "tabpanel" : "region"}
                aria-label={t("app.tabs.library")}
                aria-labelledby={mode === "compact" ? "workspace-tab-library" : undefined}
                tabIndex={0}
                className={cn(
                  PANE_CONTENT,
                  mode !== "compact" && "col-start-1 row-start-1 border-r border-border",
                  mode === "split" && "row-span-2",
                  !paneVisible("library") && "hidden",
                )}
              >
                <SectionErrorBoundary name="library" resetKeys={[language]}>
                  <LibraryPane active={paneVisible("library")} />
                </SectionErrorBoundary>
              </TabsContent>
              <TabsContent
                value="details"
                forceMount
                data-workspace-pane="details"
                hidden={!paneVisible("details")}
                role={mode === "wide" ? "region" : "tabpanel"}
                aria-label={t("app.tabs.details")}
                aria-labelledby={mode === "wide" ? undefined : "workspace-tab-details"}
                tabIndex={0}
                className={cn(
                  PANE_CONTENT,
                  mode === "split" && "col-start-2 row-start-2",
                  !paneVisible("details") && "hidden",
                )}
              >
                <SectionErrorBoundary
                  name="details"
                  resetKeys={[
                    selectedSpellId,
                    language,
                    cardDesign,
                    cardBackground,
                    activeDeck?.revision,
                  ]}
                >
                  <DetailsPane />
                </SectionErrorBoundary>
              </TabsContent>
              <TabsContent
                value="deck"
                forceMount
                data-workspace-pane="deck"
                hidden={!paneVisible("deck")}
                role={mode === "wide" ? "region" : "tabpanel"}
                aria-label={t("app.tabs.deck")}
                aria-labelledby={mode === "wide" ? undefined : "workspace-tab-deck"}
                tabIndex={0}
                className={cn(
                  PANE_CONTENT,
                  mode === "wide" && "border-l border-border",
                  mode === "split" && "col-start-2 row-start-2",
                  !paneVisible("deck") && "hidden",
                )}
              >
                <SectionErrorBoundary name="deck" resetKeys={[language, activeDeck?.revision]}>
                  <DeckPane />
                </SectionErrorBoundary>
              </TabsContent>
            </Tabs>
          </main>
        </WorkspaceLayoutContext.Provider>
      </ShowDetailsContext.Provider>

      <Dialog
        open={pendingLanguageSwitch !== null}
        onOpenChange={(open) => !open && cancelLanguageSwitch()}
      >
        <DialogContent
          title={t("app.languageSwitch.title")}
          description={
            pendingLanguageSwitch
              ? `${t("app.languageSwitch.impactDeck", {
                  count: pendingLanguageSwitch.impact.affectedEntries,
                  code: pendingLanguageSwitch.code,
                })} ${t("app.languageSwitch.impactSpells", {
                  count: pendingLanguageSwitch.impact.affectedDistinctSpellIds,
                })} ${t("app.languageSwitch.reassurance")}`
              : undefined
          }
          footer={
            <>
              <Button variant="outline" onClick={cancelLanguageSwitch}>
                {t("app.languageSwitch.cancel")}
              </Button>
              <Button onClick={() => void confirmLanguageSwitch()}>
                {t("app.languageSwitch.confirm")}
              </Button>
            </>
          }
        />
      </Dialog>

      <Dialog open={conflict !== null} onOpenChange={(open) => !open && dismissConflict()}>
        <DialogContent
          title={t("app.conflict.title")}
          description={
            conflict
              ? `${translateMessage(t, conflict.message)} ${t("app.conflict.reassurance")}`
              : undefined
          }
          footer={
            <>
              <Button variant="outline" onClick={dismissConflict}>
                {t("app.conflict.cancel")}
              </Button>
              <Button onClick={reloadLatest}>{t("app.conflict.reload")}</Button>
            </>
          }
        />
      </Dialog>
    </div>
  );
}
