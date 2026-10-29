import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/database.ts";
import {
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
} from "@/db/active-deck.ts";
import {
  InvalidDeckStateError,
  SavedDeckConflictError,
  deleteSavedDeck as deleteSavedDeckRecord,
  listSavedDecks,
  loadSavedDeck,
  newActiveDeck as newActiveDeckRecord,
  renameActiveDeck as renameActiveDeckRecord,
  saveAssociatedDeck,
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
  applySrdOverrides,
  deleteSrdOverride,
  indexOverridesByLocale,
  listSrdOverrides,
  putSrdOverride,
  type SrdOverrideInput,
} from "@/db/srd-overrides.ts";
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
import type { ActiveDeckRecord, DeckEntry, DeckStatus, SavedDeck } from "@/domain/deck";
import { getDeckStatus, hasSpellEntry, isDeckDirty } from "@/domain/deck";
import type { CardFitMode, Spell, SpellSource, SrdSpellOverride } from "@/domain/spells";
import { applyDeckImport, type DeckImportPlan } from "@/io/import-deck.ts";
import {
  AppError,
  message,
  toMessageDescriptor,
  type MessageDescriptor,
} from "@/locales/messages.ts";

export type AddSpellResult = "added" | "duplicate" | "error";

export interface AddSpellsResult {
  added: number;
  skipped: number;
  ok: boolean;
}

export type RepairDeckEntryResult = "repaired" | "duplicate" | "error";

export type LanguageStatus = "loading" | "ready" | "failed";

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
  message: MessageDescriptor;
  expectedRevision: number;
  actualRevision: number;
}

export type SaveDeckOutcome =
  | { status: "saved" }
  | { status: "clean" }
  | { status: "needs-save-as" }
  | { status: "invalid"; message: MessageDescriptor }
  | { status: "conflict"; message: MessageDescriptor }
  | { status: "error"; message: MessageDescriptor };

export type DeckActionOutcome =
  | { status: "ok" }
  | { status: "unchanged" }
  | { status: "invalid"; message: MessageDescriptor }
  | { status: "conflict"; message: MessageDescriptor }
  | { status: "error"; message: MessageDescriptor };

export type RenameDeckOutcome =
  | { status: "ok" }
  | { status: "unchanged" }
  | { status: "stale" }
  | { status: "invalid"; message: MessageDescriptor }
  | { status: "error"; message: MessageDescriptor };

export interface AppContextValue {
  manifest: BundledSpellLanguage[];
  language: string;
  languageStatus: LanguageStatus;
  languageNotice: MessageDescriptor | null;
  dismissLanguageNotice: () => void;
  englishSpells: Spell[];
  languageSpells: Spell[];
  customSpells: Spell[];
  librarySpells: Spell[];
  englishById: ReadonlyMap<string, Spell>;
  languageById: ReadonlyMap<string, Spell>;
  customById: ReadonlyMap<string, Spell>;
  dataLoading: boolean;
  dataError: MessageDescriptor | null;
  retryData: () => void;
  dismissDataError: () => void;

  selectedSpellId: string | null;
  selectSpell: (id: string | null) => void;
  selectedSpell: Spell | null;

  activeDeck: ActiveDeckRecord | null;
  savedDecks: SavedDeck[];
  dirty: boolean;
  deckStatus: DeckStatus;
  deckBusy: boolean;
  resolvedEntries: ResolvedDeckEntry[];

  deckError: MessageDescriptor | null;
  clearDeckError: () => void;
  conflict: DeckConflictState | null;
  reloadLatest: () => void;
  dismissConflict: () => void;

  addSpellToDeck: (spell: Spell) => Promise<AddSpellResult>;
  addSpellsToDeck: (spells: readonly Spell[]) => Promise<AddSpellsResult>;
  replaceDeckWithSpells: (spells: readonly Spell[]) => Promise<void>;
  removeFromDeck: (entryId: string) => Promise<void>;
  moveDeckEntry: (entryId: string, delta: -1 | 1) => Promise<void>;
  reorderDeckEntries: (fromIndex: number, toIndex: number) => Promise<void>;
  setDeckEntryFitMode: (entryId: string, fitMode: CardFitMode) => Promise<void>;
  renameActiveDeck: (name: string) => Promise<RenameDeckOutcome>;
  clearDeck: () => Promise<void>;
  repairDeckEntry: (
    entryId: string,
    target: { spellId: string; source: SpellSource; name: string },
  ) => Promise<RepairDeckEntryResult>;

  saveActiveDeck: () => Promise<SaveDeckOutcome>;
  saveDeckAs: (name: string) => Promise<DeckActionOutcome>;
  openSavedDeck: (savedId: string) => Promise<DeckActionOutcome>;
  deleteSavedDeck: (savedId: string, expectedRevision: number) => Promise<DeckActionOutcome>;
  newActiveDeck: () => Promise<DeckActionOutcome>;
  importDeck: (plan: DeckImportPlan) => Promise<DeckActionOutcome>;

  saveCustomSpell: (spell: Spell) => Promise<Spell | null>;
  duplicateSpell: (id: string) => Promise<void>;
  deleteSpell: (id: string) => Promise<boolean>;
  canUndo: boolean;
  undoDelete: () => Promise<boolean>;
  lastDeletion: CustomSpellDeletion | null;

  srdSpellOverrides: SrdSpellOverride[];
  saveSrdOverride: (input: SrdOverrideInput) => Promise<SrdSpellOverride | null>;
  resetSrdOverride: (spellId: string, locale: string) => Promise<boolean>;

  pendingLanguageSwitch: PendingLanguageSwitch | null;
  requestLanguageSwitch: (code: string) => Promise<boolean>;
  confirmLanguageSwitch: () => Promise<boolean>;
  cancelLanguageSwitch: () => void;

  refreshAll: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const EMPTY_OVERRIDES: SrdSpellOverride[] = [];

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}

function toMap(spells: readonly Spell[]): Map<string, Spell> {
  return new Map(spells.map((spell) => [spell.id, spell]));
}

function reportQueryFailure<T>(label: string, error: unknown, fallback: T): T {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`Failed to load ${label}: ${detail}`);
  return fallback;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [manifest, setManifest] = useState<BundledSpellLanguage[]>([]);
  const [language, setLanguage] = useState<string>("en");
  const [languageStatus, setLanguageStatus] = useState<LanguageStatus>("loading");
  const [languageNotice, setLanguageNotice] = useState<MessageDescriptor | null>(null);
  const [datasets, setDatasets] = useState<Record<string, Spell[]>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<MessageDescriptor | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const [selectedSpellId, setSelectedSpellId] = useState<string | null>(null);

  const [deckError, setDeckError] = useState<MessageDescriptor | null>(null);
  const [conflict, setConflict] = useState<DeckConflictState | null>(null);
  const [lastDeletion, setLastDeletion] = useState<CustomSpellDeletion | null>(null);
  const [pendingLanguageSwitch, setPendingLanguageSwitch] = useState<PendingLanguageSwitch | null>(
    null,
  );
  const [refreshToken, setRefreshToken] = useState(0);
  const loadGenerationRef = useRef(0);
  const switchGenerationRef = useRef(0);
  const datasetsRef = useRef(datasets);
  datasetsRef.current = datasets;
  const languageStatusRef = useRef(languageStatus);
  languageStatusRef.current = languageStatus;

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
  const srdOverrides = useLiveQuery(
    () => listSrdOverrides().catch((error) => reportQueryFailure("SRD overrides", error, [])),
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

  // Invalidate any in-flight initialization or language switch after unmount.
  useEffect(() => {
    return () => {
      loadGenerationRef.current += 1;
      switchGenerationRef.current += 1;
    };
  }, []);

  // Load manifest + English + selected language datasets.
  useEffect(() => {
    let cancelled = false;
    const generation = ++loadGenerationRef.current;
    const isCurrent = () => !cancelled && generation === loadGenerationRef.current;
    const load = async () => {
      setDataLoading(true);
      setLanguageStatus("loading");
      setDataError(null);
      setLanguageNotice(null);
      try {
        clearDataCache();
        const loadedManifest = await loadManifest();
        if (!isCurrent()) return;
        setManifest(loadedManifest);

        const preference = readLanguagePreference();
        const resolved = resolveInitialLanguage(loadedManifest, preference);
        const loaded: Record<string, Spell[]> = {
          en: await loadLanguageDataset("en"),
        };
        if (resolved.code !== "en") {
          loaded[resolved.code] = await loadLanguageDataset(resolved.code);
        }
        if (!isCurrent()) return;
        if (resolved.fallbackFrom) {
          clearLanguagePreference();
        }
        setDatasets(loaded);
        setLanguage(resolved.code);
        setLanguageStatus("ready");
        setDataError(null);
        if (resolved.fallbackFrom) {
          setLanguageNotice(message("language.fallback", { code: resolved.fallbackFrom }));
        }
      } catch (error) {
        if (!isCurrent()) return;
        console.error("Failed to load spell data:", error);
        setLanguage("en");
        setLanguageStatus("failed");
        setDataError(message("error.dataLoad"));
      } finally {
        if (isCurrent()) setDataLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  const overridesList = srdOverrides ?? EMPTY_OVERRIDES;
  const overridesByLocale = useMemo(() => indexOverridesByLocale(overridesList), [overridesList]);
  // Merges are derived and re-derivable; `datasets` stays override-free.
  const englishSpells = useMemo(
    () => applySrdOverrides(datasets.en ?? [], overridesByLocale.get("en")),
    [datasets, overridesByLocale],
  );
  const languageSpells = useMemo(
    () => applySrdOverrides(datasets[language] ?? [], overridesByLocale.get(language)),
    [datasets, language, overridesByLocale],
  );
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

  const dirty = useMemo(() => (activeDeck ? isDeckDirty(activeDeck) : false), [activeDeck]);
  const deckStatus = useMemo<DeckStatus>(
    () => (activeDeck ? getDeckStatus(activeDeck) : "empty"),
    [activeDeck],
  );

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
            message: toMessageDescriptor(error),
            expectedRevision: error.expectedRevision,
            actualRevision: error.actualRevision,
          });
          refreshAll();
          return false;
        }
        setDeckError(toMessageDescriptor(error));
        return false;
      }
    },
    [refreshAll],
  );

  const [deckBusy, setDeckBusy] = useState(false);
  const deckBusyRef = useRef(false);

  const beginDeckAction = useCallback(() => {
    if (deckBusyRef.current) return false;
    deckBusyRef.current = true;
    setDeckBusy(true);
    return true;
  }, []);

  const endDeckAction = useCallback(() => {
    deckBusyRef.current = false;
    setDeckBusy(false);
  }, []);

  const addSpellToDeck = useCallback(
    async (spell: Spell): Promise<AddSpellResult> => {
      let result: AddSpellResult = "duplicate";
      const ok = await runDeckMutation((current) => {
        if (hasSpellEntry(current.entries, spell.id)) return current;
        result = "added";
        return addEntry(current, makeEntry(spell.id, spell.source, spell.name));
      });
      return ok ? result : "error";
    },
    [runDeckMutation],
  );

  const addSpellsToDeck = useCallback(
    async (spells: readonly Spell[]): Promise<AddSpellsResult> => {
      if (spells.length === 0) return { added: 0, skipped: 0, ok: true };
      let added = 0;
      let skipped = 0;
      const ok = await runDeckMutation((current) => {
        const seen = new Set(current.entries.map((entry) => entry.spellId));
        let next = current;
        for (const spell of spells) {
          if (seen.has(spell.id)) {
            skipped += 1;
            continue;
          }
          seen.add(spell.id);
          next = addEntry(next, makeEntry(spell.id, spell.source, spell.name));
          added += 1;
        }
        return next;
      });
      return { added: ok ? added : 0, skipped, ok };
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

  const renameActiveDeck = useCallback(
    async (name: string): Promise<RenameDeckOutcome> => {
      if (!beginDeckAction()) return { status: "error", message: message("error.generic") };
      try {
        const current = await getActiveDeck();
        const result = await renameActiveDeckRecord(current.revision, name);
        if (result.changed) {
          publishChange("active-deck");
          refreshAll();
        }
        setDeckError(null);
        return { status: result.changed ? "ok" : "unchanged" };
      } catch (error) {
        if (error instanceof DeckConflictError) {
          refreshAll();
          return { status: "stale" };
        }
        if (error instanceof AppError) {
          return { status: "invalid", message: toMessageDescriptor(error) };
        }
        const descriptor = toMessageDescriptor(error);
        setDeckError(descriptor);
        return { status: "error", message: descriptor };
      } finally {
        endDeckAction();
      }
    },
    [beginDeckAction, endDeckAction, refreshAll],
  );

  const clearDeck = useCallback(async () => {
    await runDeckMutation((current) => clearEntries(current));
  }, [runDeckMutation]);

  const repairDeckEntryFn = useCallback(
    async (
      entryId: string,
      target: { spellId: string; source: SpellSource; name: string },
    ): Promise<RepairDeckEntryResult> => {
      let result: RepairDeckEntryResult = "error";
      const ok = await runDeckMutation((current) => {
        const entry = current.entries.find((candidate) => candidate.entryId === entryId);
        if (!entry) return current;
        const targetAlreadyPresent = current.entries.some(
          (candidate) => candidate.entryId !== entryId && candidate.spellId === target.spellId,
        );
        if (targetAlreadyPresent) {
          result = "duplicate";
          return current;
        }
        result = "repaired";
        return repairEntry(current, entryId, {
          spellId: target.spellId,
          reference: { source: target.source, name: target.name },
        });
      });
      return ok ? result : "error";
    },
    [runDeckMutation],
  );

  const saveActiveDeck = useCallback(async (): Promise<SaveDeckOutcome> => {
    if (!beginDeckAction()) return { status: "error", message: message("error.generic") };
    try {
      const current = await getActiveDeck();
      if (!isDeckDirty(current)) return { status: "clean" };
      if (getDeckStatus(current) === "invalid") {
        return { status: "invalid", message: message("error.deckStateInvalid") };
      }
      if (current.savedDeckId === undefined || current.baseline === null) {
        return { status: "needs-save-as" };
      }
      const result = await saveAssociatedDeck(current.revision);
      if (!result.changed) return { status: "clean" };
      publishChange("saved-decks");
      publishChange("active-deck");
      refreshAll();
      setDeckError(null);
      return { status: "saved" };
    } catch (error) {
      if (error instanceof SavedDeckConflictError) {
        refreshAll();
        return {
          status: "conflict",
          message:
            error.actualRevision === -1
              ? message("error.savedDeckUnavailable")
              : toMessageDescriptor(error),
        };
      }
      if (error instanceof InvalidDeckStateError || error instanceof AppError) {
        return { status: "invalid", message: toMessageDescriptor(error) };
      }
      if (error instanceof DeckConflictError) {
        setConflict({
          message: toMessageDescriptor(error),
          expectedRevision: error.expectedRevision,
          actualRevision: error.actualRevision,
        });
        refreshAll();
        return { status: "error", message: toMessageDescriptor(error) };
      }
      const descriptor = toMessageDescriptor(error);
      setDeckError(descriptor);
      return { status: "error", message: descriptor };
    } finally {
      endDeckAction();
    }
  }, [beginDeckAction, endDeckAction, refreshAll]);

  const saveDeckAs = useCallback(
    async (name: string): Promise<DeckActionOutcome> => {
      if (!beginDeckAction()) return { status: "error", message: message("error.generic") };
      try {
        const current = await getActiveDeck();
        await saveNewDeck(current.revision, name);
        publishChange("saved-decks");
        publishChange("active-deck");
        refreshAll();
        setDeckError(null);
        return { status: "ok" };
      } catch (error) {
        if (error instanceof DeckConflictError) {
          setConflict({
            message: toMessageDescriptor(error),
            expectedRevision: error.expectedRevision,
            actualRevision: error.actualRevision,
          });
          refreshAll();
          return { status: "conflict", message: toMessageDescriptor(error) };
        }
        if (error instanceof AppError) {
          return { status: "invalid", message: toMessageDescriptor(error) };
        }
        const descriptor = toMessageDescriptor(error);
        setDeckError(descriptor);
        return { status: "error", message: descriptor };
      } finally {
        endDeckAction();
      }
    },
    [beginDeckAction, endDeckAction, refreshAll],
  );

  const openSavedDeck = useCallback(
    async (savedId: string): Promise<DeckActionOutcome> => {
      if (!beginDeckAction()) return { status: "error", message: message("error.generic") };
      try {
        const current = await getActiveDeck();
        const result = await loadSavedDeck(current.revision, savedId);
        if (result.changed) {
          publishChange("active-deck");
          refreshAll();
        }
        setDeckError(null);
        return { status: result.changed ? "ok" : "unchanged" };
      } catch (error) {
        if (error instanceof DeckConflictError) {
          setConflict({
            message: toMessageDescriptor(error),
            expectedRevision: error.expectedRevision,
            actualRevision: error.actualRevision,
          });
          refreshAll();
          return { status: "conflict", message: toMessageDescriptor(error) };
        }
        const descriptor = toMessageDescriptor(error);
        setDeckError(descriptor);
        return { status: "error", message: descriptor };
      } finally {
        endDeckAction();
      }
    },
    [beginDeckAction, endDeckAction, refreshAll],
  );

  const deleteSavedDeck = useCallback(
    async (savedId: string, expectedRevision: number): Promise<DeckActionOutcome> => {
      if (!beginDeckAction()) return { status: "error", message: message("error.generic") };
      try {
        const current = await getActiveDeck();
        const result = await deleteSavedDeckRecord(current.revision, savedId, expectedRevision);
        publishChange("saved-decks");
        if (result.changed) publishChange("active-deck");
        refreshAll();
        setDeckError(null);
        return { status: "ok" };
      } catch (error) {
        if (error instanceof SavedDeckConflictError) {
          refreshAll();
          const descriptor = toMessageDescriptor(error);
          setDeckError(descriptor);
          return { status: "conflict", message: descriptor };
        }
        if (error instanceof DeckConflictError) {
          setConflict({
            message: toMessageDescriptor(error),
            expectedRevision: error.expectedRevision,
            actualRevision: error.actualRevision,
          });
          refreshAll();
          return { status: "conflict", message: toMessageDescriptor(error) };
        }
        const descriptor = toMessageDescriptor(error);
        setDeckError(descriptor);
        return { status: "error", message: descriptor };
      } finally {
        endDeckAction();
      }
    },
    [beginDeckAction, endDeckAction, refreshAll],
  );

  const newActiveDeck = useCallback(async (): Promise<DeckActionOutcome> => {
    if (!beginDeckAction()) return { status: "error", message: message("error.generic") };
    try {
      const current = await getActiveDeck();
      const result = await newActiveDeckRecord(current.revision);
      if (result.changed) {
        publishChange("active-deck");
        refreshAll();
      }
      setDeckError(null);
      return { status: result.changed ? "ok" : "unchanged" };
    } catch (error) {
      if (error instanceof DeckConflictError) {
        setConflict({
          message: toMessageDescriptor(error),
          expectedRevision: error.expectedRevision,
          actualRevision: error.actualRevision,
        });
        refreshAll();
        return { status: "conflict", message: toMessageDescriptor(error) };
      }
      const descriptor = toMessageDescriptor(error);
      setDeckError(descriptor);
      return { status: "error", message: descriptor };
    } finally {
      endDeckAction();
    }
  }, [beginDeckAction, endDeckAction, refreshAll]);

  const importDeck = useCallback(
    async (plan: DeckImportPlan): Promise<DeckActionOutcome> => {
      if (!beginDeckAction()) return { status: "error", message: message("error.generic") };
      try {
        const current = await getActiveDeck();
        await applyDeckImport(plan, current.revision);
        publishChange("active-deck");
        refreshAll();
        setDeckError(null);
        return { status: "ok" };
      } catch (error) {
        if (error instanceof DeckConflictError) {
          setConflict({
            message: toMessageDescriptor(error),
            expectedRevision: error.expectedRevision,
            actualRevision: error.actualRevision,
          });
          refreshAll();
          return { status: "conflict", message: toMessageDescriptor(error) };
        }
        const descriptor = toMessageDescriptor(error);
        setDeckError(descriptor);
        return { status: "error", message: descriptor };
      } finally {
        endDeckAction();
      }
    },
    [beginDeckAction, endDeckAction, refreshAll],
  );

  const saveCustomSpell = useCallback(
    async (spell: Spell): Promise<Spell | null> => {
      try {
        const saved = await putCustomSpell(spell);
        publishChange("custom-spells");
        refreshAll();
        return saved;
      } catch (error) {
        setDeckError(toMessageDescriptor(error));
        return null;
      }
    },
    [refreshAll],
  );

  const saveSrdOverride = useCallback(
    async (input: SrdOverrideInput): Promise<SrdSpellOverride | null> => {
      try {
        const saved = await putSrdOverride(input, {
          srdSpellsById: englishById,
          supportedLocales: manifest.map((entry) => entry.code),
        });
        publishChange("srd-overrides");
        refreshAll();
        return saved;
      } catch (error) {
        setDeckError(toMessageDescriptor(error));
        return null;
      }
    },
    [englishById, manifest, refreshAll],
  );

  const resetSrdOverride = useCallback(
    async (spellId: string, locale: string): Promise<boolean> => {
      try {
        await deleteSrdOverride(spellId, locale);
        publishChange("srd-overrides");
        refreshAll();
        return true;
      } catch (error) {
        setDeckError(toMessageDescriptor(error));
        return false;
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
        setDeckError(toMessageDescriptor(error));
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
            message: toMessageDescriptor(error),
            expectedRevision: error.expectedRevision,
            actualRevision: error.actualRevision,
          });
          refreshAll();
          return false;
        }
        setDeckError(toMessageDescriptor(error));
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
      setDeckError(toMessageDescriptor(error));
      setLastDeletion(null);
      refreshAll();
      return false;
    }
  }, [lastDeletion, activeDeck, refreshAll]);

  const commitLanguageSwitch = useCallback(
    async (code: string, requestId: number, expectedRevision?: number): Promise<boolean> => {
      let targetDataset = datasetsRef.current[code];
      try {
        targetDataset ??= await loadLanguageDataset(code);
      } catch (error) {
        if (requestId !== switchGenerationRef.current) return false;
        console.error(`Failed to load language "${code}":`, error);
        setLanguageNotice(message("language.loadFailed", { code }));
        return false;
      }
      if (requestId !== switchGenerationRef.current) return false;

      if (expectedRevision !== undefined) {
        const latest = await getActiveDeck();
        if (requestId !== switchGenerationRef.current) return false;
        if (latest.revision !== expectedRevision) return false;
      }

      const writeResult = writeLanguagePreference(code);
      setDatasets((previous) => ({ ...previous, [code]: targetDataset }));
      setLanguage(code);
      setLanguageStatus("ready");
      setPendingLanguageSwitch(null);
      setLanguageNotice(writeResult.persisted ? null : message("language.preferenceFailed"));
      return true;
    },
    [],
  );

  const requestLanguageSwitch = useCallback(
    async (code: string): Promise<boolean> => {
      if (code === language) return false;
      if (languageStatusRef.current !== "ready") return false;
      const requestId = ++switchGenerationRef.current;
      let targetDataset = datasetsRef.current[code];
      if (!targetDataset) {
        try {
          targetDataset = await loadLanguageDataset(code);
        } catch (error) {
          if (requestId !== switchGenerationRef.current) return false;
          console.error(`Failed to load language "${code}":`, error);
          setLanguageNotice(message("language.loadFailed", { code }));
          return false;
        }
      }
      if (requestId !== switchGenerationRef.current) return false;
      const deck = await getActiveDeck();
      if (requestId !== switchGenerationRef.current) return false;
      const targetById = toMap(targetDataset);
      const impact = computeLanguageSwitchImpact(deck.entries, targetById);
      if (impact.affectedEntries === 0) {
        return commitLanguageSwitch(code, requestId);
      }
      setPendingLanguageSwitch({ code, impact, activeRevision: deck.revision });
      return false;
    },
    [language, commitLanguageSwitch],
  );

  const confirmLanguageSwitch = useCallback(async (): Promise<boolean> => {
    if (!pendingLanguageSwitch) return false;
    const requestId = ++switchGenerationRef.current;
    const code = pendingLanguageSwitch.code;
    let targetDataset = datasetsRef.current[code];
    try {
      targetDataset ??= await loadLanguageDataset(code);
    } catch (error) {
      if (requestId !== switchGenerationRef.current) return false;
      console.error(`Failed to load language "${code}":`, error);
      setLanguageNotice(message("language.loadFailed", { code }));
      return false;
    }
    if (requestId !== switchGenerationRef.current) return false;
    const latest = await getActiveDeck();
    if (requestId !== switchGenerationRef.current) return false;
    if (latest.revision !== pendingLanguageSwitch.activeRevision) {
      const targetById = toMap(targetDataset);
      setPendingLanguageSwitch({
        code,
        impact: computeLanguageSwitchImpact(latest.entries, targetById),
        activeRevision: latest.revision,
      });
      return false;
    }
    return commitLanguageSwitch(code, requestId, pendingLanguageSwitch.activeRevision);
  }, [pendingLanguageSwitch, commitLanguageSwitch]);

  const cancelLanguageSwitch = useCallback(() => {
    switchGenerationRef.current += 1;
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
      languageStatus,
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
      dismissDataError: () => setDataError(null),
      selectedSpellId,
      selectSpell: setSelectedSpellId,
      selectedSpell,
      activeDeck: activeDeck ?? null,
      savedDecks: savedList,
      dirty,
      deckStatus,
      deckBusy,
      resolvedEntries,
      deckError,
      clearDeckError: () => setDeckError(null),
      conflict,
      reloadLatest,
      dismissConflict: () => setConflict(null),
      addSpellToDeck,
      addSpellsToDeck,
      replaceDeckWithSpells,
      removeFromDeck,
      moveDeckEntry,
      reorderDeckEntries,
      setDeckEntryFitMode,
      renameActiveDeck,
      clearDeck,
      repairDeckEntry: repairDeckEntryFn,
      saveActiveDeck,
      saveDeckAs,
      openSavedDeck,
      deleteSavedDeck,
      newActiveDeck,
      importDeck,
      saveCustomSpell,
      duplicateSpell,
      deleteSpell,
      canUndo,
      undoDelete,
      lastDeletion,
      srdSpellOverrides: overridesList,
      saveSrdOverride,
      resetSrdOverride,
      pendingLanguageSwitch,
      requestLanguageSwitch,
      confirmLanguageSwitch,
      cancelLanguageSwitch,
      refreshAll,
    }),
    [
      manifest,
      language,
      languageStatus,
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
      deckStatus,
      deckBusy,
      resolvedEntries,
      deckError,
      conflict,
      reloadLatest,
      addSpellToDeck,
      addSpellsToDeck,
      replaceDeckWithSpells,
      removeFromDeck,
      moveDeckEntry,
      reorderDeckEntries,
      setDeckEntryFitMode,
      renameActiveDeck,
      clearDeck,
      repairDeckEntryFn,
      saveActiveDeck,
      saveDeckAs,
      openSavedDeck,
      deleteSavedDeck,
      newActiveDeck,
      importDeck,
      saveCustomSpell,
      duplicateSpell,
      deleteSpell,
      canUndo,
      undoDelete,
      lastDeletion,
      overridesList,
      saveSrdOverride,
      resetSrdOverride,
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
