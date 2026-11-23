import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Eye, Layers, X } from "lucide-react";
import { useApp } from "@/state/AppProvider.tsx";
import { INITIAL_COLLECTION_GENERATION } from "@/db/collection-state.ts";
import { translateMessage } from "@/locales/messages.ts";
import { Header } from "./Header.tsx";
import { SectionErrorBoundary } from "./ErrorBoundary.tsx";
import { LibraryPane } from "./library/LibraryPane.tsx";
import { DetailsPane } from "./details/DetailsPane.tsx";
import { DeckPane } from "./deck/DeckPane.tsx";
import { DeckTable } from "./deck/table/DeckTable.tsx";
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
type DeckPresentation = "cards" | "table";

const PRESENTATION_KEY = "spellCards.deckPresentation";

function readDeckPresentation(): DeckPresentation {
  try {
    return localStorage.getItem(PRESENTATION_KEY) === "table" ? "table" : "cards";
  } catch {
    return "cards";
  }
}

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
    collectionGeneration,
    collectionError,
    refreshAll,
    removeDeckEntries,
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
  const [presentation, setPresentation] = useState(readDeckPresentation);
  const [managingDeck, setManagingDeck] = useState(false);
  const focusCards = useRef(false);
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
  const wide = mode === "wide";
  const tablePreferred = presentation === "table";
  const tableVisible = tablePreferred && (wide || (paneVisible("deck") && !managingDeck));
  const choosePresentation = (value: DeckPresentation) => {
    setPresentation(value);
    setManagingDeck(false);
    try {
      localStorage.setItem(PRESENTATION_KEY, value);
    } catch {
      // The switch remains usable when browser storage is unavailable.
    }
    if (!wide && value === "cards") {
      focusCards.current = true;
      changeTab("details");
    }
  };
  const presentationSwitch = (
    <div
      role="group"
      aria-label={t("deck.presentation.label")}
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-border bg-card px-3",
        mode === "compact" ? "py-0.5" : "py-2",
      )}
    >
      <Button
        variant={tablePreferred ? "outline" : "secondary"}
        aria-pressed={!tablePreferred}
        onClick={() => choosePresentation("cards")}
      >
        {t("deck.presentation.cards")}
      </Button>
      <Button
        variant={tablePreferred && (wide || !managingDeck) ? "secondary" : "outline"}
        aria-pressed={tablePreferred && (wide || !managingDeck)}
        onClick={() => choosePresentation("table")}
      >
        {t("deck.presentation.table")}
      </Button>
      {!wide && tablePreferred ? (
        <Button
          variant={managingDeck ? "secondary" : "ghost"}
          aria-pressed={managingDeck}
          onClick={() => setManagingDeck(!managingDeck)}
        >
          {t("deck.presentation.manage")}
        </Button>
      ) : null}
    </div>
  );
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    if (focusCards.current || focused?.closest("[data-workspace-pane][hidden]")) {
      focusCards.current = false;
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

  const notice = collectionError ?? languageNotice ?? deckError ?? dataError;

  return (
    <div
      className="app-shell flex flex-col overflow-hidden bg-background text-foreground"
      data-workspace-mode={mode}
      style={{ height: "calc(100dvh - var(--app-keyboard-inset, 0px))" }}
    >
      <Header />
      {notice ? (
        <div className="app-no-print flex flex-wrap items-center justify-between gap-2 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
          <span className="min-w-0 break-words" role="status">
            {translateMessage(t, notice)}
          </span>
          <div className="flex items-center gap-1">
            {collectionError ? (
              <Button variant="ghost" size="sm" onClick={refreshAll}>
                {t("common.retry")}
              </Button>
            ) : dataError && notice === dataError ? (
              <Button variant="ghost" size="sm" onClick={retryData}>
                {t("common.retry")}
              </Button>
            ) : null}
            {!collectionError ? (
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
            ) : null}
          </div>
        </div>
      ) : null}
      <ShowDetailsContext.Provider
        value={(options) => {
          if (wide && tablePreferred && !options?.preservePresentation) {
            choosePresentation("cards");
          }
          changeTab("details");
        }}
      >
        <WorkspaceLayoutContext.Provider value={mode}>
          <main
            ref={workspaceRef}
            data-workspace-mode={mode}
            className="min-h-0 flex-1 overflow-hidden"
          >
            <Tabs
              key={collectionGeneration || INITIAL_COLLECTION_GENERATION}
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
                      gridTemplateRows: "auto minmax(0,1fr)",
                    }
                  : mode === "split"
                    ? {
                        gridTemplateColumns: "clamp(320px,36%,420px) minmax(400px,1fr)",
                        gridTemplateRows: "auto minmax(0,1fr)",
                      }
                    : undefined
              }
            >
              {wide ? (
                <div className="app-no-print relative z-10 col-start-2 row-start-1 min-w-0">
                  {presentationSwitch}
                </div>
              ) : (
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
              )}
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
                  mode !== "compact" && "row-span-2",
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
                hidden={!paneVisible("details") || (wide && tableVisible)}
                role={mode === "wide" ? "region" : "tabpanel"}
                aria-label={t("app.tabs.details")}
                aria-labelledby={mode === "wide" ? undefined : "workspace-tab-details"}
                tabIndex={0}
                className={cn(
                  PANE_CONTENT,
                  mode !== "compact" && "col-start-2 row-start-2",
                  (!paneVisible("details") || (wide && tableVisible)) && "hidden",
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
                  <DetailsPane previewActive={!tableVisible} />
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
                  wide &&
                    (tableVisible
                      ? "col-start-2 col-span-2 row-start-1 row-span-2 grid grid-cols-subgrid grid-rows-subgrid bg-transparent"
                      : "col-start-3 row-start-1 row-span-2 border-l border-border"),
                  mode === "split" && "col-start-2 row-start-2",
                  !paneVisible("deck") && "hidden",
                )}
              >
                {!wide ? <div className="app-no-print">{presentationSwitch}</div> : null}
                <div
                  hidden={(!wide && tableVisible) || !paneVisible("deck")}
                  className={cn(
                    "min-h-0 min-w-0 flex-1 overflow-hidden",
                    wide && tableVisible && "col-start-2 row-span-2 border-l border-border bg-card",
                    ((!wide && tableVisible) || !paneVisible("deck")) && "hidden",
                  )}
                >
                  <SectionErrorBoundary name="deck" resetKeys={[language, activeDeck?.revision]}>
                    <DeckPane />
                  </SectionErrorBoundary>
                </div>
                <div
                  hidden={!tableVisible}
                  className={cn(
                    "app-no-print flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card",
                    wide && "col-start-1 row-start-2",
                    !tableVisible && "hidden",
                  )}
                >
                  <SectionErrorBoundary name="deck" resetKeys={[language, activeDeck?.revision]}>
                    <DeckTable
                      active={tableVisible}
                      deckInstance={activeDeck?.instanceId ?? ""}
                      removeEntries={removeDeckEntries}
                    />
                  </SectionErrorBoundary>
                </div>
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
