import { useEffect, useRef, useState } from "react";
import { BookOpen, Eye, Layers, X } from "lucide-react";
import { useApp } from "@/state/AppProvider.tsx";
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
    pendingLanguageSwitch,
    confirmLanguageSwitch,
    cancelLanguageSwitch,
    conflict,
    reloadLatest,
    dismissConflict,
  } = useApp();

  const [tab, setTab] = useState<PaneKey>("library");
  const previousSelectedSpell = useRef(selectedSpellId);

  useEffect(() => {
    if (selectedSpellId !== null && selectedSpellId !== previousSelectedSpell.current) {
      setTab("details");
    }
    previousSelectedSpell.current = selectedSpellId;
  }, [selectedSpellId]);

  return (
    <div className="app-shell flex h-screen flex-col bg-background text-foreground">
      <Header />
      {(languageNotice || deckError) && (
        <div className="app-no-print flex flex-wrap items-center justify-between gap-2 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
          <span>{languageNotice ?? deckError}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss notice"
            onClick={() => {
              if (languageNotice) dismissLanguageNotice();
              if (deckError) clearDeckError();
            }}
          >
            <X size={14} aria-hidden="true" />
          </Button>
        </div>
      )}
      <main className="min-h-0 flex-1 overflow-hidden">
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as PaneKey)}
          className="flex h-full min-h-0 flex-col min-[1200px]:grid min-[1200px]:grid-cols-[2fr_6fr_2fr]"
        >
          <TabsList className="mx-2 mt-2 self-start min-[1200px]:hidden">
            <TabsTrigger value="library">
              <BookOpen size={14} aria-hidden="true" />
              Library
            </TabsTrigger>
            <TabsTrigger value="details">
              <Eye size={14} aria-hidden="true" />
              Details
            </TabsTrigger>
            <TabsTrigger value="deck">
              <Layers size={14} aria-hidden="true" />
              Deck
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
          title="Some cards are not available in this language"
          description={
            pendingLanguageSwitch
              ? `Switching to "${pendingLanguageSwitch.code}" would make ${pendingLanguageSwitch.impact.affectedEntries} deck entr${
                  pendingLanguageSwitch.impact.affectedEntries === 1 ? "y" : "ies"
                } (${pendingLanguageSwitch.impact.affectedDistinctSpellIds} distinct spell${
                  pendingLanguageSwitch.impact.affectedDistinctSpellIds === 1 ? "" : "s"
                }) temporarily unavailable. They are not deleted and will reappear if you switch back.`
              : undefined
          }
          footer={
            <>
              <Button variant="outline" onClick={cancelLanguageSwitch}>
                Cancel
              </Button>
              <Button onClick={() => void confirmLanguageSwitch()}>Switch language</Button>
            </>
          }
        />
      </Dialog>

      <Dialog open={conflict !== null} onOpenChange={(open) => !open && dismissConflict()}>
        <DialogContent
          title="This deck changed in another tab"
          description={
            conflict ? `${conflict.message} Your uncommitted change was not applied.` : undefined
          }
          footer={
            <>
              <Button variant="outline" onClick={dismissConflict}>
                Cancel
              </Button>
              <Button onClick={reloadLatest}>Reload latest</Button>
            </>
          }
        />
      </Dialog>
    </div>
  );
}
