import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/database.ts";
import {
  addCopy,
  addEntry,
  clearEntries,
  DeckConflictError,
  ensureActiveDeck,
  getActiveDeck,
  makeEntry,
  moveEntry,
  mutateActiveDeck,
  readActiveDeck,
  removeEntry,
  reorderEntries,
  repairEntry,
  setEntryFitMode,
  type DeckSnapshot,
} from "@/db/active-deck.ts";
import {
  SavedDeckConflictError,
  deleteSavedDeck,
  listSavedDecks,
  loadSavedDeck,
  overwriteSavedDeck,
  saveNewDeck,
} from "@/db/saved-decks.ts";
import {
  deleteCustomSpell,
  listCustomSpells,
  putCustomSpell,
  duplicateCustomSpell,
  restoreDeletedSpell,
  type CustomSpellDeletion,
} from "@/db/custom-spells.ts";
import { publishChange, subscribeToChanges } from "@/db/notifications.ts";
import {
  clearDataCache,
  loadLanguageDataset,
  loadManifest,
  type BundledSpellLanguage,
} from "@/services/data/load.ts";
import {
  clearLanguagePreference,
  readLanguagePreference,
  resolveInitialLanguage,
  writeLanguagePreference,
} from "@/services/data/language.ts";
import {
  computeLanguageSwitchImpact,
  resolveEntry,
  type EntryResolution,
  type LanguageSwitchImpact,
} from "@/services/data/resolution.ts";
import type { ActiveDeckRecord, DeckEntry, SavedDeck } from "@/domain/deck";
import type { CardFitMode, Spell, SpellSource } from "@/domain/spells";

export interface ResolvedDeckEntry {
  entry: DeckEntry;
  resolution: EntryResolution;
}

export interface PendingLanguageSwitch {
  code: string;
  impact: LanguageSwitchImpact;
  activeRevision: number;
}

export interface DeckConflictState {
  message: string;
  expectedRevision: number;
  actualRevision: number;
}

export interface AppContextValue {
  manifest: BundledSpellLanguage[];
  language: string;
  languageNotice: string | null;
  dismissLanguageNotice: () => void;
  englishSpells: Spell[];
  languageSpells: Spell[];
  customSpells: Spell[];
  librarySpells: Spell[];
  englishById: ReadonlyMap<string, Spell>;
  languageById: ReadonlyMap<string, Spell>;
  customById: ReadonlyMap<string, Spell>;
  dataLoading: boolean;
  dataError: string | null;
  retryData: () => void;

  selectedSpellId: string | null;
  selectSpell: (id: string | null) => void;
  selectedSpell: Spell | null;

  activeDeck: ActiveDeckRecord | null;
  savedDecks: SavedDeck[];
  dirty: boolean;
  resolvedEntries: ResolvedDeckEntry[];

  deckError: string | null;
  clearDeckError: () => void;
  conflict: DeckConflictState | null;
  reloadLatest: () => void;
  dismissConflict: () => void;

  addSpellToDeck: (spell: Spell) => Promise<void>;
  addSpellsToDeck: (spells: readonly Spell[]) => Promise<void>;
  replaceDeckWithSpells: (spells: readonly Spell[]) => Promise<void>;
  addCopyToDeck: (entryId: string) => Promise<void>;
  removeFromDeck: (entryId: string) => Promise<void>;
  moveDeckEntry: (entryId: string, delta: -1 | 1) => Promise<void>;
  reorderDeckEntries: (fromIndex: number, toIndex: number) => Promise<void>;
  setDeckEntryFitMode: (entryId: string, fitMode: CardFitMode) => Promise<void>;
  renameDeck: (name: string) => Promise<void>;
  clearDeck: () => Promise<void>;
  repairDeckEntry: (
    entryId: string,
    target: { spellId: string; source: SpellSource; name: string },
  ) => Promise<void>;
  replaceActiveDeck: (snapshot: DeckSnapshot) => Promise<void>;

  saveDeckAs: (name: string) => Promise<SavedDeck | null>;
  overwriteDeck: (targetId: string, expectedSavedRevision: number, name: string) => Promise<void>;
  loadSaved: (savedId: string) => Promise<void>;
  deleteSaved: (savedId: string) => Promise<void>;

  saveCustomSpell: (spell: Spell) => Promise<Spell | null>;
  duplicateSpell: (id: string) => Promise<void>;
  deleteSpell: (id: string) => Promise<boolean>;
  canUndo: boolean;
  undoDelete: () => Promise<boolean>;
  lastDeletion: CustomSpellDeletion | null;

  pendingLanguageSwitch: PendingLanguageSwitch | null;
  requestLanguageSwitch: (code: string) => Promise<boolean>;
  confirmLanguageSwitch: () => Promise<boolean>;
  cancelLanguageSwitch: () => void;

  refreshAll: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}

function toMap(spells: readonly Spell[]): Map<string, Spell> {
  return new Map(spells.map((spell) => [spell.id, spell]));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reportQueryFailure<T>(label: string, error: unknown, fallback: T): T {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`Failed to load ${label}: ${detail}`);
  return fallback;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [manifest, setManifest] = useState<BundledSpellLanguage[]>([]);
  const [language, setLanguage] = useState<string>("en");
  const [languageNotice, setLanguageNotice] = useState<string | null>(null);
  const [datasets, setDatasets] = useState<Record<string, Spell[]>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const [selectedSpellId, setSelectedSpellId] = useState<string | null>(null);

  const [deckError, setDeckError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<DeckConflictState | null>(null);
  const [lastDeletion, setLastDeletion] = useState<CustomSpellDeletion | null>(null);
  const [pendingLanguageSwitch, setPendingLanguageSwitch] = useState<PendingLanguageSwitch | null>(
    null,
  );
  const [refreshToken, setRefreshToken] = useState(0);

  const activeDeck = useLiveQuery(
    () => readActiveDeck().catch((error) => reportQueryFailure("active deck", error, null)),
    [refreshToken],
  );
  const customSpells = useLiveQuery(
    () => listCustomSpells().catch((error) => reportQueryFailure("custom spells", error, [])),
    [refreshToken],
  );
  const savedDecks = useLiveQuery(
    () => listSavedDecks().catch((error) => reportQueryFailure("saved decks", error, [])),
    [refreshToken],
  );

  const refreshAll = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  // Ensure the active-deck singleton exists once on mount.
  useEffect(() => {
    void ensureActiveDeck().catch((error) => reportQueryFailure("active deck", error, null));
  }, []);

  // Cross-tab advisory notifications.
  useEffect(() => {
    return subscribeToChanges(() => refreshAll());
  }, [refreshAll]);

  // Load manifest + English + selected language datasets.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setDataLoading(true);
      try {
        clearDataCache();
        const loadedManifest = await loadManifest();
        if (cancelled) return;
        setManifest(loadedManifest);

        const preference = readLanguagePreference();
        const resolved = resolveInitialLanguage(loadedManifest, preference);
        if (resolved.fallbackFrom) {
          clearLanguagePreference();
          setLanguageNotice(
            `The previously selected language "${resolved.fallbackFrom}" is no longer available. Switched to English.`,
          );
        }
        const codesToLoad = new Set<string>(["en", resolved.code]);
        const loaded: Record<string, Spell[]> = {};
        for (const code of codesToLoad) {
          loaded[code] = await loadLanguageDataset(code);
        }
        if (cancelled) return;
        setDatasets(loaded);
        setLanguage(resolved.code);
        setDataError(null);
      } catch (error) {
        if (cancelled) return;
        setDataError(errorMessage(error));
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  const englishSpells = datasets.en ?? [];
  const languageSpells = datasets[language] ?? [];
  const customList = customSpells ?? [];
  const savedList = savedDecks ?? [];

  const englishById = useMemo(() => toMap(englishSpells), [englishSpells]);
  const languageById = useMemo(() => toMap(languageSpells), [languageSpells]);
  const customById = useMemo(() => toMap(customList), [customList]);

  const librarySpells = useMemo(
    () => [...languageSpells, ...customList],
    [languageSpells, customList],
  );

  const selectedSpell = useMemo(() => {
    if (!selectedSpellId) return null;
    return languageById.get(selectedSpellId) ?? customById.get(selectedSpellId) ?? null;
  }, [selectedSpellId, languageById, customById]);

  const resolvedEntries = useMemo<ResolvedDeckEntry[]>(() => {
    if (!activeDeck) return [];
    const context = {
      languageSpellsById: languageById,
      englishSpellsById: englishById,
      customSpellsById: customById,
    };
    return activeDeck.entries.map((entry) => ({
      entry,
      resolution: resolveEntry(entry, context),
    }));
  }, [activeDeck, languageById, englishById, customById]);

  const dirty = useMemo(() => {
    if (!activeDeck) return false;
    const baseline = activeDeck.baseline;
    if (baseline === null) {
      return activeDeck.name.trim() !== "" || activeDeck.entries.length > 0;
    }
    if (activeDeck.name !== baseline.name) return true;
    if (activeDeck.entries.length !== baseline.entries.length) return true;
    return activeDeck.entries.some((entry, index) => {
      const other = baseline.entries[index];
      return (
        !other ||
        entry.entryId !== other.entryId ||
        entry.spellId !== other.spellId ||
        entry.fitMode !== other.fitMode ||
        entry.reference.source !== other.reference.source ||
        entry.reference.name !== other.reference.name
      );
    });
  }, [activeDeck]);

  const runDeckMutation = useCallback(
    async (
      mutator: Parameters<typeof mutateActiveDeck>[1],
      options?: { publish?: boolean },
    ): Promise<boolean> => {
      const current = await getActiveDeck();
      try {
        await mutateActiveDeck(current.revision, mutator);
        if (options?.publish !== false) publishChange("active-deck");
        setDeckError(null);
        return true;
      } catch (error) {
        if (error instanceof DeckConflictError) {
          setConflict({
            message: error.message,
            expectedRevision: error.expectedRevision,
            actualRevision: error.actualRevision,
          });
          refreshAll();
          return false;
        }
        setDeckError(errorMessage(error));
        return false;
      }
    },
    [refreshAll],
  );

  const addSpellToDeck = useCallback(
    async (spell: Spell) => {
      await runDeckMutation((current) =>
        addEntry(current, makeEntry(spell.id, spell.source, spell.name)),
      );
    },
    [runDeckMutation],
  );

  const addSpellsToDeck = useCallback(
    async (spells: readonly Spell[]) => {
      if (spells.length === 0) return;
      await runDeckMutation((current) =>
        spells.reduce(
          (deck, spell) => addEntry(deck, makeEntry(spell.id, spell.source, spell.name)),
          current,
        ),
      );
    },
    [runDeckMutation],
  );

  const replaceDeckWithSpells = useCallback(
    async (spells: readonly Spell[]) => {
      await runDeckMutation((current) => ({
        ...current,
        entries: spells.map((spell) => makeEntry(spell.id, spell.source, spell.name)),
      }));
    },
    [runDeckMutation],
  );

  const addCopyToDeck = useCallback(
    async (entryId: string) => {
      await runDeckMutation((current) => addCopy(current, entryId));
    },
    [runDeckMutation],
  );

  const removeFromDeck = useCallback(
    async (entryId: string) => {
      await runDeckMutation((current) => removeEntry(current, entryId));
    },
    [runDeckMutation],
  );

  const moveDeckEntry = useCallback(
    async (entryId: string, delta: -1 | 1) => {
      await runDeckMutation((current) => moveEntry(current, entryId, delta));
    },
    [runDeckMutation],
  );

  const reorderDeckEntries = useCallback(
    async (fromIndex: number, toIndex: number) => {
      await runDeckMutation((current) => reorderEntries(current, fromIndex, toIndex));
    },
    [runDeckMutation],
  );

  const setDeckEntryFitMode = useCallback(
    async (entryId: string, fitMode: CardFitMode) => {
      await runDeckMutation((current) => setEntryFitMode(current, entryId, fitMode));
    },
    [runDeckMutation],
  );

  const renameDeck = useCallback(
    async (name: string) => {
      await runDeckMutation((current) => ({ ...current, name }));
    },
    [runDeckMutation],
  );

  const clearDeck = useCallback(async () => {
    await runDeckMutation((current) => clearEntries(current));
  }, [runDeckMutation]);

  const repairDeckEntryFn = useCallback(
    async (entryId: string, target: { spellId: string; source: SpellSource; name: string }) => {
      await runDeckMutation((current) =>
        repairEntry(current, entryId, {
          spellId: target.spellId,
          reference: { source: target.source, name: target.name },
        }),
      );
    },
    [runDeckMutation],
  );

  const replaceActiveDeck = useCallback(
    async (snapshot: DeckSnapshot) => {
      await runDeckMutation((current) => ({
        ...current,
        name: snapshot.name,
        entries: snapshot.entries,
        savedDeckId: snapshot.savedDeckId,
        baseline: snapshot.baseline,
      }));
    },
    [runDeckMutation],
  );

  const saveDeckAs = useCallback(
    async (name: string): Promise<SavedDeck | null> => {
      const current = await getActiveDeck();
      try {
        const result = await saveNewDeck(current.revision, name, current.entries);
        publishChange("saved-decks");
        publishChange("active-deck");
        setDeckError(null);
        return result.savedDeck;
      } catch (error) {
        if (error instanceof DeckConflictError) {
          setConflict({
            message: error.message,
            expectedRevision: error.expectedRevision,
            actualRevision: error.actualRevision,
          });
          refreshAll();
          return null;
        }
        setDeckError(errorMessage(error));
        return null;
      }
    },
    [refreshAll],
  );

  const overwriteDeck = useCallback(
    async (targetId: string, expectedSavedRevision: number, name: string) => {
      const current = await getActiveDeck();
      try {
        await overwriteSavedDeck({
          activeExpectedRevision: current.revision,
          targetSavedId: targetId,
          expectedSavedRevision,
          name,
          entries: current.entries,
        });
        publishChange("saved-decks");
        publishChange("active-deck");
        setDeckError(null);
      } catch (error) {
        if (error instanceof SavedDeckConflictError) {
          setDeckError(error.message);
          refreshAll();
          return;
        }
        if (error instanceof DeckConflictError) {
          setConflict({
            message: error.message,
            expectedRevision: error.expectedRevision,
            actualRevision: error.actualRevision,
          });
          refreshAll();
          return;
        }
        setDeckError(errorMessage(error));
      }
    },
    [refreshAll],
  );

  const loadSaved = useCallback(
    async (savedId: string) => {
      const current = await getActiveDeck();
      try {
        await loadSavedDeck(current.revision, savedId);
        publishChange("active-deck");
        setDeckError(null);
      } catch (error) {
        if (error instanceof DeckConflictError) {
          setConflict({
            message: error.message,
            expectedRevision: error.expectedRevision,
            actualRevision: error.actualRevision,
          });
          refreshAll();
          return;
        }
        setDeckError(errorMessage(error));
      }
    },
    [refreshAll],
  );

  const deleteSaved = useCallback(
    async (savedId: string) => {
      const current = await getActiveDeck();
      try {
        await deleteSavedDeck(current.revision, savedId);
        publishChange("saved-decks");
        publishChange("active-deck");
        setDeckError(null);
      } catch (error) {
        if (error instanceof DeckConflictError) {
          setConflict({
            message: error.message,
            expectedRevision: error.expectedRevision,
            actualRevision: error.actualRevision,
          });
          refreshAll();
          return;
        }
        setDeckError(errorMessage(error));
      }
    },
    [refreshAll],
  );

  const saveCustomSpell = useCallback(
    async (spell: Spell): Promise<Spell | null> => {
      try {
        const saved = await putCustomSpell(spell);
        publishChange("custom-spells");
        refreshAll();
        return saved;
      } catch (error) {
        setDeckError(errorMessage(error));
        return null;
      }
    },
    [refreshAll],
  );

  const duplicateSpell = useCallback(
    async (id: string) => {
      try {
        await duplicateCustomSpell(id);
        publishChange("custom-spells");
        refreshAll();
      } catch (error) {
        setDeckError(errorMessage(error));
      }
    },
    [refreshAll],
  );

  const deleteSpell = useCallback(
    async (id: string): Promise<boolean> => {
      const current = await getActiveDeck();
      try {
        const deletion = await deleteCustomSpell(current.revision, id);
        if (!deletion) return false;
        setLastDeletion(deletion);
        publishChange("custom-spells");
        publishChange("active-deck");
        refreshAll();
        return true;
      } catch (error) {
        if (error instanceof DeckConflictError) {
          setConflict({
            message: error.message,
            expectedRevision: error.expectedRevision,
            actualRevision: error.actualRevision,
          });
          refreshAll();
          return false;
        }
        setDeckError(errorMessage(error));
        return false;
      }
    },
    [refreshAll],
  );

  const canUndo = useMemo(() => {
    if (!lastDeletion || !activeDeck) return false;
    if (customList.some((spell) => spell.id === lastDeletion.spellId)) return false;
    return activeDeck.revision === lastDeletion.activeRevisionAfter;
  }, [lastDeletion, activeDeck, customList]);

  const undoDelete = useCallback(async (): Promise<boolean> => {
    if (!lastDeletion || !activeDeck) return false;
    try {
      await restoreDeletedSpell(lastDeletion, activeDeck.revision);
      setLastDeletion(null);
      publishChange("custom-spells");
      publishChange("active-deck");
      refreshAll();
      return true;
    } catch (error) {
      setDeckError(errorMessage(error));
      setLastDeletion(null);
      refreshAll();
      return false;
    }
  }, [lastDeletion, activeDeck, refreshAll]);

  const switchToLanguage = useCallback(
    async (code: string) => {
      if (!datasets[code]) {
        try {
          const dataset = await loadLanguageDataset(code);
          setDatasets((previous) => ({ ...previous, [code]: dataset }));
        } catch (error) {
          setLanguageNotice(
            `Failed to load language "${code}": ${errorMessage(error)}. Staying on the current language.`,
          );
          return;
        }
      }
      setLanguage(code);
      const writeResult = writeLanguagePreference(code);
      if (!writeResult.persisted) {
        setLanguageNotice(
          "Language changed for this session, but the preference could not be saved and will not survive a reload.",
        );
      }
    },
    [datasets],
  );

  const requestLanguageSwitch = useCallback(
    async (code: string): Promise<boolean> => {
      if (code === language) return false;
      let targetDataset = datasets[code];
      if (!targetDataset) {
        try {
          targetDataset = await loadLanguageDataset(code);
          setDatasets((previous) => ({ ...previous, [code]: targetDataset as Spell[] }));
        } catch (error) {
          setLanguageNotice(`Failed to load language "${code}": ${errorMessage(error)}.`);
          return false;
        }
      }
      const targetById = toMap(targetDataset);
      const deck = activeDeck ?? (await getActiveDeck());
      const impact = computeLanguageSwitchImpact(deck.entries, targetById);
      if (impact.affectedEntries === 0) {
        await switchToLanguage(code);
        return true;
      }
      setPendingLanguageSwitch({ code, impact, activeRevision: deck.revision });
      return false;
    },
    [language, datasets, activeDeck, switchToLanguage],
  );

  const confirmLanguageSwitch = useCallback(async (): Promise<boolean> => {
    if (!pendingLanguageSwitch) return false;
    const latest = await getActiveDeck();
    if (latest.revision !== pendingLanguageSwitch.activeRevision) {
      const targetDataset = datasets[pendingLanguageSwitch.code];
      const targetById = toMap(targetDataset ?? []);
      setPendingLanguageSwitch({
        code: pendingLanguageSwitch.code,
        impact: computeLanguageSwitchImpact(latest.entries, targetById),
        activeRevision: latest.revision,
      });
      return false;
    }
    await switchToLanguage(pendingLanguageSwitch.code);
    setPendingLanguageSwitch(null);
    return true;
  }, [pendingLanguageSwitch, datasets, switchToLanguage]);

  const cancelLanguageSwitch = useCallback(() => {
    setPendingLanguageSwitch(null);
  }, []);

  const reloadLatest = useCallback(() => {
    setConflict(null);
    refreshAll();
  }, [refreshAll]);

  const value = useMemo<AppContextValue>(
    () => ({
      manifest,
      language,
      languageNotice,
      dismissLanguageNotice: () => setLanguageNotice(null),
      englishSpells,
      languageSpells,
      customSpells: customList,
      librarySpells,
      englishById,
      languageById,
      customById,
      dataLoading,
      dataError,
      retryData: () => setRetryToken((token) => token + 1),
      selectedSpellId,
      selectSpell: setSelectedSpellId,
      selectedSpell,
      activeDeck: activeDeck ?? null,
      savedDecks: savedList,
      dirty,
      resolvedEntries,
      deckError,
      clearDeckError: () => setDeckError(null),
      conflict,
      reloadLatest,
      dismissConflict: () => setConflict(null),
      addSpellToDeck,
      addSpellsToDeck,
      replaceDeckWithSpells,
      addCopyToDeck,
      removeFromDeck,
      moveDeckEntry,
      reorderDeckEntries,
      setDeckEntryFitMode,
      renameDeck,
      clearDeck,
      repairDeckEntry: repairDeckEntryFn,
      replaceActiveDeck,
      saveDeckAs,
      overwriteDeck,
      loadSaved,
      deleteSaved,
      saveCustomSpell,
      duplicateSpell,
      deleteSpell,
      canUndo,
      undoDelete,
      lastDeletion,
      pendingLanguageSwitch,
      requestLanguageSwitch,
      confirmLanguageSwitch,
      cancelLanguageSwitch,
      refreshAll,
    }),
    [
      manifest,
      language,
      languageNotice,
      englishSpells,
      languageSpells,
      customList,
      librarySpells,
      englishById,
      languageById,
      customById,
      dataLoading,
      dataError,
      selectedSpellId,
      selectedSpell,
      activeDeck,
      savedList,
      dirty,
      resolvedEntries,
      deckError,
      conflict,
      reloadLatest,
      addSpellToDeck,
      addSpellsToDeck,
      replaceDeckWithSpells,
      addCopyToDeck,
      removeFromDeck,
      moveDeckEntry,
      reorderDeckEntries,
      setDeckEntryFitMode,
      renameDeck,
      clearDeck,
      repairDeckEntryFn,
      replaceActiveDeck,
      saveDeckAs,
      overwriteDeck,
      loadSaved,
      deleteSaved,
      saveCustomSpell,
      duplicateSpell,
      deleteSpell,
      canUndo,
      undoDelete,
      lastDeletion,
      pendingLanguageSwitch,
      requestLanguageSwitch,
      confirmLanguageSwitch,
      cancelLanguageSwitch,
      refreshAll,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export { db };
