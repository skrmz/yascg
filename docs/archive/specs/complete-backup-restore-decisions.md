# Complete backup and restore decisions

**Status** — All refinement decisions approved. The consolidated specification is awaiting explicit approval.

[Feature specification](complete-backup-restore-spec.md)

## Explicit requirements from the original request

- Export a complete collection in one action. Include the active deck, all saved snapshots, all custom spells, and local SRD overrides. Preserve ordering, settings that belong to the stored collection, and relationships.
- Replace the destination collection only after validation, a visible warning, and explicit confirmation. A failed restore must leave existing data recoverable. Bundled definitions can be resolved by reference.
- Distinguish the new workflow from deck-only and custom-spell import/export.

## Verified constraints

- A Dexie transaction can cover the four collection stores. The language preference is outside that transaction. [Database](../../../src/db/database.ts) · [Preference storage](../../../src/services/data/language.ts)
- Missing deck references are supported state. Override application depends on a matching spell and locale with eligible components. [Reference resolution](../../../src/services/data/resolution.ts) · [Override validation](../../../src/domain/srd-overrides.ts) · [Override application](../../../src/db/srd-overrides.ts)
- Ordinary deck conflict checks rely on revisions that can coincide with values from a different collection. Notifications refresh views and are advisory. [Deck writes](../../../src/db/active-deck.ts) · [Saved decks](../../../src/db/saved-decks.ts) · [Notifications](../../../src/db/notifications.ts)

## Approved decisions

| ID | Decision | Approved behavior and rationale | Specification |
| --- | --- | --- | --- |
| D1 | Language preference and content fidelity | Keep the destination preference in place. Preserve overrides for every supported locale and every custom spell's stored content. The preference lives outside IndexedDB, so this keeps the collection within one transaction. Including the preference would require transactional preference storage or cross-store recovery. | [CB-1](complete-backup-restore-spec.md#cb-1--collection-contents-and-fidelity) |
| D2 | Override and format compatibility | Reject the entire restore if any override is incompatible with the receiving catalog. Include every affected spell ID, locale, and reason. Preserve unresolved deck references, including their IDs and fallback names. An explicit backup format version supports lossless migration of older formats where feasible. Unsupported versions fail safely. Keeping incompatible overrides as inactive records would require management rules and could hide notes users expect to see. | [CB-3](complete-backup-restore-spec.md#cb-3--versioning-validation-and-compatibility) |
| D3 | Multiple tabs and stale actions | Support multiple app tabs. Require fresh review and confirmation if the collection changed after review. Use a persistent collection generation or equivalent, checked transactionally by every collection mutation. Reject stale editors, delayed actions, and actions from suspended tabs even when record tokens coincide and notification delivery fails. Never retry stale work against the new collection. Requiring closed tabs would interrupt work and still need enforceable exclusion. | [CB-5](complete-backup-restore-spec.md#cb-5--concurrent-tabs-and-stale-actions) |

The user also reaffirmed atomic replacement, safe failure, a distinct backup format, and lossless preservation of all supported records, relationships, IDs, ordering, baselines, and relevant persisted metadata. Required coverage includes lossless round trips, failed restores, concurrent changes, and stale tabs.

## Open questions

None. Explicit approval of the consolidated specification is pending.

## Deferred items

- Self-contained single-deck export is an optional, separate feature in the original request.
- Inactive SRD override management is deferred by the approved compatibility decision.
- User-provided backgrounds and preferences from other feature requests are outside the current persisted collection. Their eventual backup compatibility belongs to the features that introduce them.

## Assumptions and implementation discretion

- V1 is the first version of the complete backup format. No earlier complete format exists in the inspected source. The current narrow formats retain their existing contracts.
- Filenames, exact field names, placement of the actions, and the transactional guard design can follow repository conventions within the specified guarantees.
