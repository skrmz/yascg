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
import { CollectionChangedError, readCollectionSnapshot } from "@/db/collection-state.ts";
import { savePersonalBackgroundSelection } from "@/db/personal-backgrounds.ts";
import {
  addEntry,
  clearEntries,
  DeckConflictError,
  readCurrentDeck,
  makeEntry,
  moveEntry,
  mutateActiveDeck,
  removeEntry,
  removeEntries,
  reorderEntries,
  reorderMatchingEntries,
  repairEntry,
  replaceEntryWithSpell,
  setEntryFitMode,
  type DeckIdentity,
  type ReplaceEntryWithSpellResult,
} from "@/db/active-deck.ts";
import {
  InvalidDeckStateError,
  SavedDeckConflictError,
  deleteSavedDeck as deleteSavedDeckRecord,
  loadSavedDeck,
  newActiveDeck as newActiveDeckRecord,
  renameActiveDeck as renameActiveDeckRecord,
  saveAssociatedDeck,
  saveNewDeck,
} from "@/db/saved-decks.ts";
import {
  deleteCustomSpell,
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
  putSrdOverride,
  type SrdOverrideInput,
} from "@/db/srd-overrides.ts";
import {
  clearDataCache,
  loadLanguageDataset,
  loadManifest,
  loadShortDescriptions,
  type BundledSpellLanguage,
} from "@/services/data/load.ts";
import {
  clearLanguagePreference,
  detectBrowserLanguage,
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
import { newUuid } from "@/domain/ids";
import { dedupeDeckEntries, getDeckStatus, hasSpellEntry, isDeckDirty } from "@/domain/deck";
import type { CardFitMode, Spell, SpellSource, SrdSpellOverride } from "@/domain/spells";
import type { ShortDescriptionMap } from "@/domain/short-descriptions";
import { DEFAULT_CARD_DESIGN, normalizeCardDesign, type CardDesign } from "@/cards/design.ts";
import {
  DEFAULT_CARD_BACKGROUND,
  normalizeCardBackground,
  type CardBackground,
} from "@/cards/backgrounds.ts";
import { backgroundDataUrl, type PersonalBackground } from "@/cards/personal-backgrounds.ts";
import { applyDeckImport, type DeckImportPlan } from "@/io/import-deck.ts";
import {
  AppError,
  message,
  toMessageDescriptor,
  type MessageDescriptor,
} from "@/locales/messages.ts";

export type AddSpellResult = "added" | "duplicate" | "error";
const EMPTY_PERSONAL_BACKGROUNDS: PersonalBackground[] = [];

export interface AddSpellsResult {
  added: number;
  skipped: number;
  ok: boolean;
}

export type RepairDeckEntryResult = "repaired" | "duplicate" | "error";

export type DeckMutationOutcome =
  | { status: "ok" }
  | { status: "conflict"; actualRevision: number }
  | { status: "error" };

export type ReplaceDeckEntryWithCopyResult =
  | { status: "replaced" }
  | { status: "conflict"; actualRevision: number }
  | { status: "deck-changed" }
  | { status: "missing" }
  | { status: "duplicate" }
  | { status: "error" };

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
  /**
   * Pre-generated short descriptions per locale. Retained across UI language
   * switches so an open editor draft keeps resolving its captured language.
   */
  shortDescriptionsByLocale: Record<string, ShortDescriptionMap>;
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

  cardDesign: CardDesign;
  setCardDesign: (design: CardDesign) => void;

  cardBackground: CardBackground;
  setCardBackground: (id: string) => Promise<void>;
  personalBackgrounds: PersonalBackground[];

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

  addSpellToDeck: (
    spell: Spell,
    options?: { selectOnSuccess?: boolean },
  ) => Promise<AddSpellResult>;
  addSpellsToDeck: (spells: readonly Spell[]) => Promise<AddSpellsResult>;
  replaceDeckWithSpells: (spells: readonly Spell[]) => Promise<void>;
  removeFromDeck: (entryId: string) => Promise<void>;
  removeDeckEntries: (
    entryIds: readonly string[],
    expectedRevision: number,
  ) => Promise<"ok" | "changed" | "error">;
  moveDeckEntry: (entryId: string, delta: -1 | 1) => Promise<void>;
  reorderDeckEntries: (fromIndex: number, toIndex: number) => Promise<void>;
  applyDeckEntryOrder: (
    orderedIds: readonly string[],
    expectedRevision: number,
  ) => Promise<DeckMutationOutcome>;
  setDeckEntryFitMode: (entryId: string, fitMode: CardFitMode) => Promise<void>;
  renameActiveDeck: (name: string) => Promise<RenameDeckOutcome>;
  clearDeck: () => Promise<void>;
  repairDeckEntry: (
    entryId: string,
    target: { spellId: string; source: SpellSource; name: string },
  ) => Promise<RepairDeckEntryResult>;
  replaceDeckEntryWithCopy: (
    expectedRevision: number,
    deckIdentity: DeckIdentity,
    entryId: string,
    sourceSpellId: string,
    copy: Pick<Spell, "id" | "name" | "source">,
  ) => Promise<ReplaceDeckEntryWithCopyResult>;

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
  collectionGeneration: string;
  collectionError: MessageDescriptor | null;
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [manifest, setManifest] = useState<BundledSpellLanguage[]>([]);
  const [language, setLanguage] = useState<string>(
    () => readLanguagePreference() ?? detectBrowserLanguage(),
  );
  const [languageStatus, setLanguageStatus] = useState<LanguageStatus>("loading");
  const [languageNotice, setLanguageNotice] = useState<MessageDescriptor | null>(null);
  const [datasets, setDatasets] = useState<Record<string, Spell[]>>({});
  const [shortDescriptionsByLocale, setShortDescriptionsByLocale] = useState<
    Record<string, ShortDescriptionMap>
  >({});
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<MessageDescriptor | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const [selectedSpellId, setSelectedSpellId] = useState<string | null>(null);
  const selectionRevision = useRef(0);
  const selectSpell = useCallback((id: string | null) => {
    selectionRevision.current += 1;
    setSelectedSpellId(id);
  }, []);
  const [cardDesign, setCardDesignState] = useState<CardDesign>(DEFAULT_CARD_DESIGN);

  const setCardDesign = useCallback((design: CardDesign) => {
    setCardDesignState(normalizeCardDesign(design));
  }, []);

  const [sessionBackground, setSessionBackground] = useState<{
    id: string;
    generation: string;
  } | null>(null);
  const cachedBackground = useRef<{ id: string; url: string; generation: string } | null>(null);

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

  /**
   * Merges a locale's pre-generated short descriptions into the per-locale
   * record. The loader never throws: a missing or broken sidecar leaves the
   * record unchanged and only disables the editor action.
   */
  const ensureShortDescriptions = useCallback(async (code: string) => {
    const map = await loadShortDescriptions(code);
    setShortDescriptionsByLocale((previous) => ({ ...previous, [code]: map }));
  }, []);

  const collectionResult = useLiveQuery(async () => {
    try {
      const snapshot = await readCollectionSnapshot();
      const { personalBackgroundId, personalBackgrounds } = snapshot.collection;
      const { generation } = snapshot.metadata;
      const selected = personalBackgrounds.find(({ id }) => id === personalBackgroundId);
      let background = cachedBackground.current;
      // An image ID is immutable within a generation. A restore can reuse IDs.
      if (selected && (background?.id !== selected.id || background.generation !== generation)) {
        background = { id: selected.id, generation, url: await backgroundDataUrl(selected.image) };
      }
      if (!selected) background = null;
      cachedBackground.current = background;
      return { snapshot, background, error: null };
    } catch (error) {
      return {
        snapshot: null,
        background: null,
        error: error instanceof AppError ? error.descriptor : message("error.storageUnavailable"),
      };
    }
  }, [refreshToken]);
  const collection = collectionResult?.snapshot?.collection;
  const collectionGeneration = collectionResult?.snapshot?.metadata.generation ?? "";
  const personalBackgrounds = collection?.personalBackgrounds ?? EMPTY_PERSONAL_BACKGROUNDS;
  const savedBackground = collectionResult?.background;
  const cardBackground =
    savedBackground ??
    (sessionBackground?.generation === collectionGeneration
      ? sessionBackground.id
      : DEFAULT_CARD_BACKGROUND);
  useEffect(() => {
    if (savedBackground) setSessionBackground(null);
  }, [savedBackground]);
  const activeDeck = collection?.activeDeck;
  const srdOverrides = collection?.srdSpellOverrides;
  const customSpells = useMemo(
    () => collection?.customSpells.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [collection?.customSpells],
  );
  const savedDecks = useMemo(
    () =>
      collection?.savedDecks
        .map((deck) => ({ ...deck, entries: dedupeDeckEntries(deck.entries) }))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [collection?.savedDecks],
  );

  const refreshAll = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  const setCardBackground = useCallback(
    async (id: string) => {
      const bundled = normalizeCardBackground(id);
      const personal = personalBackgrounds.some((background) => background.id === id);
      if (!personal && bundled !== id) throw new AppError(message("card.background.notFound"));
      await savePersonalBackgroundSelection(personal ? id : null, collectionGeneration);
      setSessionBackground(personal ? null : { id: bundled, generation: collectionGeneration });
      refreshAll();
    },
    [collectionGeneration, personalBackgrounds, refreshAll],
  );

  const seenGeneration = useRef("");
  useEffect(() => {
    if (!collectionGeneration) return;
    if (seenGeneration.current && seenGeneration.current !== collectionGeneration) {
      setLastDeletion(null);
      setConflict(null);
      setPendingLanguageSwitch(null);
      switchGenerationRef.current += 1;
      setDeckError(message("backup.workspaceUpdated"));
    }
    seenGeneration.current = collectionGeneration;
  }, [collectionGeneration]);

  const reportCollectionConflict = useCallback(
    (error: unknown) => {
      if (error instanceof CollectionChangedError) {
        setDeckError(error.descriptor);
        refreshAll();
      }
    },
    [refreshAll],
  );

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
        setShortDescriptionsByLocale({});
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
        // Sidecars load in isolation: a failure must not fail the app startup.
        void ensureShortDescriptions(resolved.code);
        if (resolved.code !== "en") void ensureShortDescriptions("en");
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
  }, [retryToken, ensureShortDescriptions]);

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
      options?: {
        publish?: boolean;
        expectedRevision?: number;
        handleConflict?: "global" | "return";
      },
    ): Promise<DeckMutationOutcome> => {
      try {
        const expectedRevision =
          options?.expectedRevision ?? (await readCurrentDeck(collectionGeneration)).revision;
        await mutateActiveDeck(expectedRevision, mutator, [], collectionGeneration);
        if (options?.publish !== false) publishChange("active-deck");
        setDeckError(null);
        return { status: "ok" };
      } catch (error) {
        reportCollectionConflict(error);
        if (error instanceof DeckConflictError) {
          if (options?.handleConflict !== "return") {
            setConflict({
              message: toMessageDescriptor(error),
              expectedRevision: error.expectedRevision,
              actualRevision: error.actualRevision,
            });
          }
          refreshAll();
          return { status: "conflict", actualRevision: error.actualRevision };
        }
        setDeckError(toMessageDescriptor(error));
        return { status: "error" };
      }
    },
    [refreshAll, collectionGeneration, reportCollectionConflict],
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
    async (spell: Spell, options?: { selectOnSuccess?: boolean }): Promise<AddSpellResult> => {
      const startedAtSelection = selectionRevision.current;
      let added = false;
      const outcome = await runDeckMutation((current) => {
        if (hasSpellEntry(current.entries, spell.id)) return current;
        added = true;
        return addEntry(current, makeEntry(spell.id, spell.source, spell.name));
      });
      if (outcome.status !== "ok") return "error";
      // An explicit selection made while the write was pending takes precedence.
      if (added && options?.selectOnSuccess && selectionRevision.current === startedAtSelection) {
        setSelectedSpellId(spell.id);
      }
      return added ? "added" : "duplicate";
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
      const succeeded = ok.status === "ok";
      return { added: succeeded ? added : 0, skipped, ok: succeeded };
    },
    [runDeckMutation],
  );

  const replaceDeckWithSpells = useCallback(
    async (spells: readonly Spell[]) => {
      await runDeckMutation((current) => ({
        ...current,
        instanceId: newUuid(),
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

  const removeDeckEntries = useCallback(
    async (entryIds: readonly string[], expectedRevision: number) => {
      const ids = new Set(entryIds);
      let changedSinceConfirmation = false;
      const outcome = await runDeckMutation(
        (current) => {
          const next = removeEntries(current, ids);
          changedSinceConfirmation = current.entries.length - next.entries.length !== ids.size;
          return changedSinceConfirmation ? current : next;
        },
        { expectedRevision, handleConflict: "return" },
      );
      if (outcome.status === "conflict" || changedSinceConfirmation) return "changed";
      return outcome.status;
    },
    [runDeckMutation],
  );

  const moveDeckEntry = useCallback(
    async (entryId: string, delta: -1 | 1) => {
      await runDeckMutation((current) => moveEntry(current, entryId, delta));
    },
    [runDeckMutation],
  );

  const activeDeckRevision = activeDeck?.revision;
  const reorderDeckEntries = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (activeDeckRevision === undefined) return;
      await runDeckMutation((current) => reorderEntries(current, fromIndex, toIndex), {
        expectedRevision: activeDeckRevision,
        handleConflict: "return",
      });
    },
    [activeDeckRevision, runDeckMutation],
  );

  const applyDeckEntryOrder = useCallback(
    (orderedIds: readonly string[], expectedRevision: number) =>
      runDeckMutation((current) => reorderMatchingEntries(current, orderedIds), {
        expectedRevision,
      }),
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
        const current = await readCurrentDeck(collectionGeneration);
        const result = await renameActiveDeckRecord(current.revision, name, collectionGeneration);
        if (result.changed) {
          publishChange("active-deck");
          refreshAll();
        }
        setDeckError(null);
        return { status: result.changed ? "ok" : "unchanged" };
      } catch (error) {
        reportCollectionConflict(error);
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
    [beginDeckAction, endDeckAction, refreshAll, collectionGeneration, reportCollectionConflict],
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
      const outcome = await runDeckMutation((current) => {
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
      return outcome.status === "ok" ? result : "error";
    },
    [runDeckMutation],
  );

  const replaceDeckEntryWithCopy = useCallback(
    async (
      expectedRevision: number,
      deckIdentity: DeckIdentity,
      entryId: string,
      sourceSpellId: string,
      copy: Pick<Spell, "id" | "name" | "source">,
    ): Promise<ReplaceDeckEntryWithCopyResult> => {
      let result: ReplaceEntryWithSpellResult = { status: "missing" };
      const outcome = await runDeckMutation(
        (current) => {
          result = replaceEntryWithSpell(current, deckIdentity, entryId, sourceSpellId, {
            spellId: copy.id,
            reference: { source: copy.source, name: copy.name },
          });
          return result.status === "replaced" ? result.deck : current;
        },
        { expectedRevision, handleConflict: "return" },
      );
      if (outcome.status === "conflict") {
        return { status: "conflict", actualRevision: outcome.actualRevision };
      }
      if (outcome.status === "error") return { status: "error" };
      return { status: result.status };
    },
    [runDeckMutation],
  );

  const saveActiveDeck = useCallback(async (): Promise<SaveDeckOutcome> => {
    if (!beginDeckAction()) return { status: "error", message: message("error.generic") };
    try {
      const current = await readCurrentDeck(collectionGeneration);
      if (!isDeckDirty(current)) return { status: "clean" };
      if (getDeckStatus(current) === "invalid") {
        return { status: "invalid", message: message("error.deckStateInvalid") };
      }
      if (current.savedDeckId === undefined || current.baseline === null) {
        return { status: "needs-save-as" };
      }
      const result = await saveAssociatedDeck(current.revision, collectionGeneration);
      if (!result.changed) return { status: "clean" };
      publishChange("saved-decks");
      publishChange("active-deck");
      refreshAll();
      setDeckError(null);
      return { status: "saved" };
    } catch (error) {
      reportCollectionConflict(error);
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
  }, [beginDeckAction, endDeckAction, refreshAll, collectionGeneration, reportCollectionConflict]);

  const saveDeckAs = useCallback(
    async (name: string): Promise<DeckActionOutcome> => {
      if (!beginDeckAction()) return { status: "error", message: message("error.generic") };
      try {
        const current = await readCurrentDeck(collectionGeneration);
        await saveNewDeck(current.revision, name, collectionGeneration);
        publishChange("saved-decks");
        publishChange("active-deck");
        refreshAll();
        setDeckError(null);
        return { status: "ok" };
      } catch (error) {
        reportCollectionConflict(error);
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
    [beginDeckAction, endDeckAction, refreshAll, collectionGeneration, reportCollectionConflict],
  );

  const openSavedDeck = useCallback(
    async (savedId: string): Promise<DeckActionOutcome> => {
      if (!beginDeckAction()) return { status: "error", message: message("error.generic") };
      try {
        const current = await readCurrentDeck(collectionGeneration);
        const result = await loadSavedDeck(current.revision, savedId, collectionGeneration);
        if (result.changed) {
          publishChange("active-deck");
          refreshAll();
        }
        setDeckError(null);
        return { status: result.changed ? "ok" : "unchanged" };
      } catch (error) {
        reportCollectionConflict(error);
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
    [beginDeckAction, endDeckAction, refreshAll, collectionGeneration, reportCollectionConflict],
  );

  const deleteSavedDeck = useCallback(
    async (savedId: string, expectedRevision: number): Promise<DeckActionOutcome> => {
      if (!beginDeckAction()) return { status: "error", message: message("error.generic") };
      try {
        const current = await readCurrentDeck(collectionGeneration);
        const result = await deleteSavedDeckRecord(
          current.revision,
          savedId,
          expectedRevision,
          collectionGeneration,
        );
        publishChange("saved-decks");
        if (result.changed) publishChange("active-deck");
        refreshAll();
        setDeckError(null);
        return { status: "ok" };
      } catch (error) {
        reportCollectionConflict(error);
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
    [beginDeckAction, endDeckAction, refreshAll, collectionGeneration, reportCollectionConflict],
  );

  const newActiveDeck = useCallback(async (): Promise<DeckActionOutcome> => {
    if (!beginDeckAction()) return { status: "error", message: message("error.generic") };
    try {
      const current = await readCurrentDeck(collectionGeneration);
      const result = await newActiveDeckRecord(current.revision, collectionGeneration);
      if (result.changed) {
        publishChange("active-deck");
        refreshAll();
      }
      setDeckError(null);
      return { status: result.changed ? "ok" : "unchanged" };
    } catch (error) {
      reportCollectionConflict(error);
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
  }, [beginDeckAction, endDeckAction, refreshAll, collectionGeneration, reportCollectionConflict]);

  const importDeck = useCallback(
    async (plan: DeckImportPlan): Promise<DeckActionOutcome> => {
      if (!beginDeckAction()) return { status: "error", message: message("error.generic") };
      try {
        const current = await readCurrentDeck(collectionGeneration);
        await applyDeckImport(plan, current.revision, collectionGeneration);
        publishChange("active-deck");
        refreshAll();
        setDeckError(null);
        return { status: "ok" };
      } catch (error) {
        reportCollectionConflict(error);
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
    [beginDeckAction, endDeckAction, refreshAll, collectionGeneration, reportCollectionConflict],
  );

  const saveCustomSpell = useCallback(
    async (spell: Spell): Promise<Spell | null> => {
      try {
        const saved = await putCustomSpell(spell, collectionGeneration);
        publishChange("custom-spells");
        refreshAll();
        return saved;
      } catch (error) {
        reportCollectionConflict(error);
        setDeckError(toMessageDescriptor(error));
        return null;
      }
    },
    [refreshAll, collectionGeneration, reportCollectionConflict],
  );

  const saveSrdOverride = useCallback(
    async (input: SrdOverrideInput): Promise<SrdSpellOverride | null> => {
      try {
        const saved = await putSrdOverride(
          input,
          {
            srdSpellsById: englishById,
            supportedLocales: manifest.map((entry) => entry.code),
          },
          collectionGeneration,
        );
        publishChange("srd-overrides");
        refreshAll();
        return saved;
      } catch (error) {
        reportCollectionConflict(error);
        setDeckError(toMessageDescriptor(error));
        return null;
      }
    },
    [englishById, manifest, refreshAll, collectionGeneration, reportCollectionConflict],
  );

  const resetSrdOverride = useCallback(
    async (spellId: string, locale: string): Promise<boolean> => {
      try {
        await deleteSrdOverride(spellId, locale, collectionGeneration);
        publishChange("srd-overrides");
        refreshAll();
        return true;
      } catch (error) {
        reportCollectionConflict(error);
        setDeckError(toMessageDescriptor(error));
        return false;
      }
    },
    [refreshAll, collectionGeneration, reportCollectionConflict],
  );

  const duplicateSpell = useCallback(
    async (id: string) => {
      try {
        await duplicateCustomSpell(id, collectionGeneration);
        publishChange("custom-spells");
        refreshAll();
      } catch (error) {
        reportCollectionConflict(error);
        setDeckError(toMessageDescriptor(error));
      }
    },
    [refreshAll, collectionGeneration, reportCollectionConflict],
  );

  const deleteSpell = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const current = await readCurrentDeck(collectionGeneration);
        const deletion = await deleteCustomSpell(current.revision, id, collectionGeneration);
        if (!deletion) return false;
        setLastDeletion(deletion);
        publishChange("custom-spells");
        publishChange("active-deck");
        refreshAll();
        return true;
      } catch (error) {
        reportCollectionConflict(error);
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
    [refreshAll, collectionGeneration, reportCollectionConflict],
  );

  const canUndo = useMemo(() => {
    if (!lastDeletion || !activeDeck || lastDeletion.generation !== collectionGeneration)
      return false;
    if (customList.some((spell) => spell.id === lastDeletion.spellId)) return false;
    return activeDeck.revision === lastDeletion.activeRevisionAfter;
  }, [lastDeletion, activeDeck, customList, collectionGeneration]);

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
      reportCollectionConflict(error);
      setDeckError(toMessageDescriptor(error));
      setLastDeletion(null);
      refreshAll();
      return false;
    }
  }, [lastDeletion, activeDeck, refreshAll, reportCollectionConflict]);

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
        const latest = await readCurrentDeck();
        if (requestId !== switchGenerationRef.current) return false;
        if (latest.revision !== expectedRevision) return false;
      }

      const writeResult = writeLanguagePreference(code);
      setDatasets((previous) => ({ ...previous, [code]: targetDataset }));
      setLanguage(code);
      setLanguageStatus("ready");
      setPendingLanguageSwitch(null);
      setLanguageNotice(writeResult.persisted ? null : message("language.preferenceFailed"));
      // Never clear previously loaded maps: an open draft may still need its
      // captured language after the switch.
      void ensureShortDescriptions(code);
      return true;
    },
    [ensureShortDescriptions],
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
      const deck = await readCurrentDeck();
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
    const latest = await readCurrentDeck();
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
      shortDescriptionsByLocale,
      englishById,
      languageById,
      customById,
      dataLoading,
      dataError,
      retryData: () => setRetryToken((token) => token + 1),
      dismissDataError: () => setDataError(null),
      selectedSpellId,
      selectSpell,
      selectedSpell,
      cardDesign,
      setCardDesign,
      cardBackground,
      setCardBackground,
      personalBackgrounds,
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
      removeDeckEntries,
      moveDeckEntry,
      reorderDeckEntries,
      applyDeckEntryOrder,
      setDeckEntryFitMode,
      renameActiveDeck,
      clearDeck,
      repairDeckEntry: repairDeckEntryFn,
      replaceDeckEntryWithCopy,
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
      collectionGeneration,
      collectionError: collectionResult?.error ?? null,
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
      shortDescriptionsByLocale,
      englishById,
      languageById,
      customById,
      dataLoading,
      dataError,
      selectedSpellId,
      selectSpell,
      selectedSpell,
      cardDesign,
      setCardDesign,
      cardBackground,
      setCardBackground,
      personalBackgrounds,
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
      removeDeckEntries,
      moveDeckEntry,
      reorderDeckEntries,
      applyDeckEntryOrder,
      setDeckEntryFitMode,
      renameActiveDeck,
      clearDeck,
      repairDeckEntryFn,
      replaceDeckEntryWithCopy,
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
      collectionGeneration,
      collectionResult?.error,
    ] as const,
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export { db };
