import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Eye, Layers, X } from "lucide-react";
import { useApp } from "@/state/AppProvider.tsx";
import { translateMessage } from "@/locales/messages.ts";
import { Header } from "./Header.tsx";
import { LibraryPane } from "./library/LibraryPane.tsx";
import { DetailsPane } from "./details/DetailsPane.tsx";
import { DeckPane } from "./deck/DeckPane.tsx";
import { Button } from "@/ui/Button.tsx";
import { Dialog, DialogContent } from "@/ui/Dialog.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/Tabs.tsx";
import { cn } from "@/ui/cn.ts";

type PaneKey = "library" | "details" | "deck";

const PANE_CONTENT =
  "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-card focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring";

export function AppShell() {
  const {
    selectedSpellId,
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

  const [tab, setTab] = useState<PaneKey>("library");
  const previousSelectedSpell = useRef(selectedSpellId);

  useEffect(() => {
    if (selectedSpellId !== null && selectedSpellId !== previousSelectedSpell.current) {
      setTab("details");
    }
    previousSelectedSpell.current = selectedSpellId;
  }, [selectedSpellId]);

  const notice = languageNotice ?? deckError ?? dataError;

  return (
    <div className="app-shell flex h-screen flex-col bg-background text-foreground">
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
      <main className="min-h-0 flex-1 overflow-hidden">
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as PaneKey)}
          className="flex h-full min-h-0 flex-col min-[1200px]:grid min-[1200px]:grid-cols-[2fr_6fr_2fr]"
        >
          <TabsList className="mx-2 mt-2 self-start min-[1200px]:hidden">
            <TabsTrigger value="library">
              <BookOpen size={14} aria-hidden="true" />
              {t("app.tabs.library")}
            </TabsTrigger>
            <TabsTrigger value="details">
              <Eye size={14} aria-hidden="true" />
              {t("app.tabs.details")}
            </TabsTrigger>
            <TabsTrigger value="deck">
              <Layers size={14} aria-hidden="true" />
              {t("app.tabs.deck")}
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="library"
            forceMount
            tabIndex={tab === "library" ? 0 : -1}
            className={cn(
              PANE_CONTENT,
              "min-[1200px]:border-r min-[1200px]:border-border",
              tab !== "library" && "max-[1199px]:hidden",
            )}
          >
            <LibraryPane />
          </TabsContent>
          <TabsContent
            value="details"
            forceMount
            tabIndex={tab === "details" ? 0 : -1}
            className={cn(PANE_CONTENT, tab !== "details" && "max-[1199px]:hidden")}
          >
            <DetailsPane />
          </TabsContent>
          <TabsContent
            value="deck"
            forceMount
            tabIndex={tab === "deck" ? 0 : -1}
            className={cn(
              PANE_CONTENT,
              "min-[1200px]:border-l min-[1200px]:border-border",
              tab !== "deck" && "max-[1199px]:hidden",
            )}
          >
            <DeckPane />
          </TabsContent>
        </Tabs>
      </main>

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
