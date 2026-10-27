# DnD 5.5e 2024 - official subclasses

> **Authoritative subclass catalog.** This 48-item list is the canonical catalog of official
> 2024 subclasses and the source for the localized labels in `src/locales/en.ts` /
> `src/locales/de.ts` (`SUBCLASSES` in `src/domain/subclasses.ts`). The German column lists
> presentation labels only; stored identifiers are always canonical English
> `"<Class>: <Subclass>"` strings.
>
> Subclass assignments in `data/srd/srd-spells-2024*.json` were reconciled from
> `data/reference/srd-spells-2024_extended-props.json`. The reference also contains
> subclasses that are **not** in this catalog:
>
> - **reference-only** subclasses (parent class among the 12 `CORE_CLASSES`, e.g.
>   `Cleric: Arcana`, `Sorcerer: Divine Soul (Chaos)`) are preserved verbatim; they have no
>   German label and fall back to the English subclass name at render time;
> - **excluded** subclasses (parent class outside `CORE_CLASSES`, i.e. Artificer) are
>   reported as `unsupported-parent-class` and are not stored.
>
> The full alias map, dedup-collision report, and per-file counts are committed at
> `data/reference/subclass-reconciliation.json`, produced by
> `scripts/migrate-srd-subclasses.ts`.

Here are the 48 official subclasses (from the DnD 5.5e 2024 player's handbook) grouped by classes along with the corresponding german terms.

## Barbar (Barbarian)

-   Path of the Berserker → Pfad des Berserkers
-   Path of the Wild Heart → Pfad des Wilden Herzens
-   Path of the World Tree → Pfad des Weltenbaums
-   Path of the Zealot → Pfad des Eiferers

## Barde (Bard)

-   College of Dance → Kolleg des Tanzes
-   College of Glamour → Kolleg des Glamours
-   College of Lore → Kolleg des Wissens
-   College of Valor → Kolleg der Tapferkeit

## Kleriker (Cleric)

-   Life Domain → Domäne des Lebens (Lebensdomäne)
-   Light Domain → Domäne des Lichts (Lichtdomäne)
-   Trickery Domain → Domäne der List (Listdomäne)
-   War Domain → Domäne des Krieges (Kriegsdomäne)

## Druide (Druid)

-   Circle of the Land → Zirkel des Landes
-   Circle of the Moon → Zirkel des Mondes
-   Circle of the Sea → Zirkel des Meeres
-   Circle of the Stars → Zirkel der Sterne

## Kämpfer (Fighter)

-   Battle Master → Kampfmeister
-   Champion → Champion
-   Eldritch Knight → Arkaner Ritter
-   Psi Warrior → Psi-Krieger
    
## Mönch (Monk)

-   Warrior of Mercy → Krieger der Gnade
-   Warrior of the Elements → Krieger der Elemente
-   Warrior of the Open Hand → Krieger der offenen Hand    
-   Warrior of Shadow → Krieger des Schattens

## Paladin (Paladin)

-   Oath of Devotion → Eid der Hingabe
-   Oath of Glory → Eid des Ruhms
-   Oath of the Ancients → Eid der Alten
-   Oath of Vengeance → Eid der Rache

## Waldläufer (Ranger)

-   Beast Master → Herr der Tiere
-   Gloom Stalker → Düsternispirscher
-   Hunter → Jäger
-   Fey Wanderer → Feenwanderer

## Schurke (Rogue)

-   Arcane Trickster → Arkaner Betrüger
-   Assassin → Assassine
-   Soulknife → Seelenmesser (teilweise Seelenklinge)
-   Thief → Dieb

## Zauberer (Sorcerer)

-   Aberrant Sorcery → Abnorme Zaubermacht (oder Abnorme Zauberei).
-   Clockwork Sorcery → Uhrwerk-Zaubermacht (oder Uhrwerk-Zauberei)
-   Draconic Sorcery → Drakonische Zaubermacht
-   Wild Magic Sorcery → Wilde Magie

## Hexenmeister (Warlock)

-   Archfey Patron → Schirmherr: Die Erzfee
-   Celestial Patron → Schirmherr: Der Himmlische
-   Fiend Patron → Schirmherr: Der Unhold
-   Great Old One Patron  → Schirmherr: Der Große Alte

## Magier (Wizard)

-   Abjurer → Bannmagier
-   Diviner → Seher
-   Evoker → Hervorrufer  
-   Illusionist → Illusionist
