
# D&D 5e Spell Card Abbreviations (English / Deutsch)

Based on D&D 5e terminology (German SRD 5.2.1 / 2024 rules). The terms follow the rules; **abbreviations are a mix of conventional D&D shorthand and proposed, app-specific shorthand**. They are not all official identifiers. Abbreviations are case-sensitive.

This catalog contains D&D terminology, spell-card-specific shorthand, and common language abbreviations. It serves as the single runtime source for all abbreviations.

Abbreviations may contain periods, spaces, or special characters. Duplicate abbreviations are permitted when their meanings can be distinguished by context. They are not guaranteed to be globally unique or reversible.

Compact cards use fixed action/indicator badges with the catalog `.full` meaning in tooltips and the legend, while footer/component abbreviations display the catalog `.short` value.

The parity test reads this document and compares the English and German inventories independently. Each parity line has the form `- full = short (full = short)`; use `—` for a missing side, for example `- foot = ft (—)` or `- — (Zauber = Z.)`. Catalog entry counts are derived automatically rather than maintained manually.

## Catalog model

Each locale has an independent abbreviation catalog. A definition specifies `full`, `short`, and optionally `suffixes`, `forms`, `quantityPrefix`, and `timeUnit`. The generated surfaces are `full`, every `full + suffix`, and every explicit `forms` entry; all of them map to the same `short`. Entries without inflection metadata match only their exact spelling. German `psychic` is one definition covering `psychisch`, `psychische`, `psychischer`, `psychisches`, `psychischem`, and `psychischen`. German `meter` (`Meter`, `Meters`, `Metern`), `minute` (`Minute`, `Minuten`), `hour` (`Stunde`, `Stunden`), `day` (`Tag`, `Tage`), `object` (`Gegenstand`), `objects` (`Gegenstände`, `Gegenständen`), and `physical` (`physisch`, `physische`, `physischer`, `physisches`, `physischem`, `physischen`) use the same mechanism.

`quantityPrefix` marks a short that is only applied when the surface introduces a numeric quantity. A written number word with a numeric short counts as such a quantity. `timeUnit` marks units that are compacted after a quantity prefix, as in `≤ 1h`; other units keep their normal spacing, as in `≤ 30 ft`.

## Manual abbreviation of custom spell prose

The custom spell editor offers **Abbreviate** for non-SRD drafts. The action transforms only the user-authored draft values (`description`, higher levels, casting time, range, duration, and component descriptions); it never changes UI labels or structured fields. Nothing is persisted until the spell is saved, and **Undo abbreviation** restores the fields changed by the latest action until the editor closes. See the [custom spells guide](custom-spells-guide.md) for the user workflow.

Reviewed short descriptions may also contain catalog abbreviations (for example `BA`, `DEX`, or `SCH`). Because those texts are applied to editable spell copies, the in-app Legend covers abbreviations introduced by **Apply short description** as well as by **Abbreviate**. The catalog itself is unchanged; see the [short descriptions guide](short-descriptions.md) for the authoring pipeline.

English `up to` and German `bis zu` become `≤` only when they introduce a numeric quantity. A time unit in that quantity is compacted without a space: `up to 1 hour` → `≤ 1h`, `up to 10 minutes` → `≤ 10min`, `up to 3 days` → `≤ 3d`, and `bis zu 3 Tage` → `≤ 3t`. Written number words from zero through ten and hundred also count as quantities: `up to one hour` → `≤ 1h`, `up to ten minutes` → `≤ 10min`, and `bis zu zwei Stunden` → `≤ 2h`. Other units and nouns keep their normal spacing: `up to 30 feet` → `≤ 30 ft`, `up to 3 creatures` → `≤ 3 creatures`. Phrases without a number, such as `up to the DM's discretion`, are unchanged.

Matching uses the language captured when the editor opened. Only exact `en` and `de` codes have catalogs; other languages are a no-op with an explanatory status, never an English fallback. Catalog identity and display remain case-sensitive: `m` (meter) and `M` (material component) are distinct. Manual prose matching is locale-aware case-insensitive, so `Bonus Action`, `BONUS ACTION`, and `bonus action` share the `BA` short.

Three distinct states apply to a catalog entry:

1. **Defined:** the entry exists in `abbreviations-en.ts`/`abbreviations-de.ts` (wired into `en.ts`/`de.ts`) and in this catalog. Defined entries always drive structured UI lookups, Compact card badges, tooltips, and the legend.
2. **Eligible for automatic replacement:** the entry is defined, its trimmed short is strictly shorter than its trimmed full form, and its ID is not in the locale's exclusion set. Only eligible entries are matched by **Abbreviate**.
3. **Excluded:** the ID is in the locale's exclusion set. It remains defined and usable by structured UI lookups, but **Abbreviate** leaves it unchanged and reports it only through development diagnostics.

A term can therefore have a defined abbreviation and still be excluded: the catalog answers "what is this term's short form?", while the exclusion list answers "should the prose transformer rewrite this word automatically?".

Only catalog definitions and their generated forms are eligible, and longer surfaces win. Whitespace is not collapsed. Inflection is matched only where explicitly configured: English keeps separate `foot`/`feet`, `object`/`objects`, `meter`/`meters`, `minute`/`minutes`, and `hour`/`hours` entries, while German consolidates these into `suffixes`/`forms` on `psychic`, `physical`, `object`/`objects`, `meter`, `minute`, `hour`, and `day`. Unconfigured inflections and stems are never inferred. No-op entries whose short is not shorter than their full form are never eligible, even when they are also listed as excluded for policy reasons.

The following exclusions are policy, not algorithm. Removing an entry from this list is a product decision; it does not require a matcher change. Exclusions currently protect common prose words whose short form would be ambiguous or non-standard in running text:

- English exclusions: `turn`, `speed`, `presumably`, `possibly`, `in part`.
- German exclusions: `Zug`, `vermutlich`, `oder`, `Durchmesser`, `Würfel`.

English and German still differ deliberately: `Bewegungsrate` remains eligible in German, while the English `speed` is excluded; German `eventuell` and `zum Teil` are eligible while the English `possibly` and `in part` are excluded. `action`, `reaction`, `round`, `damage`, `advantage`, `disadvantage`, `target`, `object`/`objects`, `minimum`, `maximum`, `example`, `compare`, `between`, `including`, `condition`, `against`, `obviously`/`obvious`, `point`, `physical`, `following`, `option`, `illusory`, `at least`, `strength check`, the ability saving throws, and the written numbers (and their German equivalents) are eligible as approved standalone terms; longer phrases such as `bonus action`, `for example`, `damage resistance`, and `Schadensresistenz` still win.

Manual matching transforms only visible prose. Fenced and inline code, HTML comments/tags and attributes, autolinks, bare URLs and email addresses, reference definitions, images, link destinations/titles/reference identifiers, backslash escapes, and structural Markdown delimiters are protected and copied byte-for-byte. Bold and italic text, headings, blockquotes, list items, table cells, and inline/full-reference link labels remain transformable. Source formatting is never serialized or regenerated.

**Undo abbreviation** is session-only and restores the fields changed by the latest action until the editor closes. Saving stores the abbreviated text; no reversible backup or automatic de-abbreviation is persisted.

## Common D&D abbreviations

- armor class = AC (Rüstungsklasse = RK)
- hit points = HP (Trefferpunkte = TP)
- strength = STR (Stärke = ST)
- dexterity = DEX (Geschicklichkeit = GE)
- constitution = CON (Konstitution = KO)
- intelligence = INT (Intelligenz = IN)
- wisdom = WIS (Weisheit = WE)
- charisma = CHA (Charisma = CH)
- difficulty class = DC (Schwierigkeitsgrad = SG)
- saving throw = SAVE (Rettungswurf = RW)
- strength check = STR check (Stärkewurf = ST-Wurf)
- strength saving throw = STR save (Stärkerettungswurf = ST-RW)
- dexterity saving throw = DEX save (Geschicklichkeitsrettungswurf = GE-RW)
- constitution saving throw = CON save (Konstitutionsrettungswurf = KO-RW)
- intelligence saving throw = INT save (Intelligenzrettungswurf = IN-RW)
- wisdom saving throw = WIS save (Weisheitsrettungswurf = WE-RW)
- charisma saving throw = CHA save (Charismarettungswurf = CH-RW)
- proficiency bonus = PB (Übungsbonus = ÜB)
- initiative = INIT (Initiative = INIT)
- speed = SPD (Bewegungsrate = BR)
- advantage = adv. (Vorteil = VT)
- disadvantage = disadv. (Nachteil = NT)
- attack roll = ATK (Angriffswurf = AW)
- damage = dmg (Schaden = SCH)
- damage resistance = RES (Schadensresistenz = RES)
- damage immunity = IMM (Schadensimmunität = IMM)
- vulnerability = VUL (Schadensanfälligkeit = ANF)
- — (Zauber = Z.)
- spell attack = SATK (Zauberangriff = ZAng.)
- spell save DC = SSDC (SG für Zauberrettungswürfe = Z-SG)
- spell slot = slot (Zauberplatz = ZP)
- cantrip = CTP (Zaubertrick = ZT)
- ritual = RIT (Ritual = RIT)
- concentration = Conc. (Konzentration = Konz.)
- verbal component = V (Verbalkomponente = V)
- somatic component = S (Gestenkomponente = G)
- material component = M (Materialkomponente = M)
- action = A (Aktion = A)
- bonus action = BA (Bonusaktion = BA)
- reaction = R (Reaktion = R)
- round = rnd. (Runde = Rnd.)
- turn = TURN (Zug = ZUG)
- short rest = SR (Kurze Rast = KR)
- long rest = LR (Lange Rast = LR)
- d4 / four-sided die = d4 (W4 / vierseitiger Würfel = W4)
- d6 / six-sided die = d6 (W6 / sechsseitiger Würfel = W6)
- d8 / eight-sided die = d8 (W8 / achtseitiger Würfel = W8)
- d10 / ten-sided die = d10 (W10 / zehnseitiger Würfel = W10)
- d12 / twelve-sided die = d12 (W12 / zwölfseitiger Würfel = W12)
- d20 / twenty-sided die = d20 (W20 / zwanzigseitiger Würfel = W20)
- d100 / percentile die = d100 (W100 / Prozentwürfel = W100)

## Additional spell-card abbreviations

- area of effect = AoE (Wirkungsbereich = WB)
- casting time = CT (Zeitaufwand = ZA)
- range = rng. (Reichweite = RWt)
- duration = dur. (Wirkungsdauer = WD)
- character level = lvl (Charakterstufe = Stf.)
- casting at higher levels = UPCAST (Verwenden von Zauberplätzen höheren Grades = Grad+)
- cantrip upgrade = CTP+ (Zaubertrick-Aufwertung = ZT+)
- instantaneous = inst. (Unmittelbar = unm.)
- until dispelled = disp. (Bis gebannt = bis geb.)
- until the end of the next turn = EONT (Bis zum Ende des nächsten Zugs = bis EZ)
- until the start of the next turn = SONT (Bis zum Beginn des nächsten Zugs = bis BZ)
- — (Berührung = Ber.)
- target = tgt. (Ziel = Ziel)
- object = obj. (Gegenstand = Ggst.)
- objects = obj. (Gegenstände = Ggstd.)
- radius = rad. (Radius = Rad.)
- diameter = dia. (Durchmesser = Durchm.)
- — (Kugel = Kug.)
- — (Würfel = Wwürf.)
- cylinder = cyl. (Zylinder = Zyl.)
- emanation = EMAN (Emanation = Eman.)
- foot = ft (—)
- feet = ft (—)
- meter = mtr (Meter = m)
- meters = mtr (—)
- minute = min (Minute = min)
- minutes = min (—)
- hour = h (Stunde = h)
- hours = h (—)
- day = d (Tag = t)
- days = d (—)
- up to = ≤ (bis zu = ≤)
- modifier = mod. (Modifikator = Mod.)
- minimum = min. (Minimum = Min.)
- maximum = max. (Maximum = Max.)
- half damage = ½ dmg (Halber Schaden = ½ SCH)
- on a failed save = FAIL (Bei misslungenem Rettungswurf = FEHL)
- on a successful save = PASS (Bei gelungenem Rettungswurf = ERF)
- half = ½ (halb = ½)
- three-quarters cover = TQC (Dreivierteldeckung = DVD)
- total cover = TC (Vollständige Deckung = VD)

### Schools of magic

- abjuration = ABJ (Bannmagie = BAN)
- conjuration = CONJ (Beschwörungsmagie = BES)
- divination = DIV (Erkenntnismagie = ERK)
- enchantment = ENC (Verzauberungsmagie = VERZ)
- evocation = EVO (Hervorrufungsmagie = HER)
- illusion = ILL (Illusionsmagie = ILL)
- necromancy = NEC (Nekromantie = NEK)
- transmutation = TRN (Verwandlungsmagie = VWD)

### Character classes

- barbarian = BARB (Barbar = BARB)
- bard = BRD (Barde = BRD)
- cleric = CLR (Kleriker = KLE)
- druid = DRU (Druide = DRU)
- fighter = FTR (Kämpfer = KÄM)
- monk = MNK (Mönch = MÖN)
- paladin = PAL (Paladin = PAL)
- ranger = RNG-R (Waldläufer = WAL)
- rogue = ROG (Schurke = SCHU)
- sorcerer = SOR (Zauberer = ZAU)
- warlock = WL (Hexenmeister = HEX)
- wizard = WIZ (Magier = MAG)

### Damage types

- acid damage = ACID (Säureschaden = SÄU)
- bludgeoning damage = BLUD (Wuchtschaden = WUCHT)
- cold damage = COLD (Kälteschaden = KÄLTE)
- fire damage = FIRE (Feuerschaden = FEUER)
- force damage = FORCE (Energieschaden = ENERG)
- lightning damage = LGTN (Blitzschaden = BLITZ)
- necrotic damage = NECR (Nekrotischer Schaden = NEKR)
- piercing damage = PIER (Stichschaden = STICH)
- poison damage = POIS (Giftschaden = GIFT)
- psychic = psyc. (psychisch = psych.)
- psychic damage = PSYC (Psychischer Schaden = PSY)
- radiant damage = RADI (Gleißender Schaden = GLEISS)
- slashing damage = SLAS (Hiebschaden = HIEB)
- thunder damage = THUN (Schallschaden = SCHALL)

## General language abbreviations

Common abbreviations for everyday language, descriptive text, and explanatory notes. These are not D&D-specific terms. German abbreviations follow common written usage where possible; some compact forms are app-specific. English and German abbreviations are not necessarily interchangeable in meaning or usage.

- example = ex. (Beispiel = Bsp.)
- — (oder = o.)
- respectively / or rather = resp. (beziehungsweise = bzw.)
- between = b/w (zwischen = zw.)
- presumably = presum. (vermutlich = vmtl.)
- that is = i.e. (das heißt = d. h.)
- among others = a.o. (unter anderem = u. a.)
- for example = e.g. (zum Beispiel = z. B.)
- and so on = etc. (und so weiter = usw.)
- et cetera = etc. (et cetera = etc.)
- — (sogenannt = sog.)
- compare = cf. (vergleiche = vgl.)
- approximately = approx. (circa = ca.)
- possibly = poss. (eventuell = evtl.)
- in part = partly (zum Teil = z. T.)
- — (Treffer = Trf.)
- attribute = attr. (Attribut = Attr.)
- spell casting modifier = spell mod. (Zauber-Attributsmodifikator = Z.-Attr.Mod.)
- including = incl. (—)
- condition = cond. (—)
- against = vs. (gegen = gg.)
- obviously = obv. (—)
- obvious = obv. (—)
- point = pt. (Punkt = Pkt.)
- physical = phys. (physisch = phys.)
- following = foll. (folgenden = folg.)
- option = opt. (Option = Opt.)
- illusory = illus. (illusionär = illus.)
- at least = ≥ (mindestens = mind.)
- — (addieren = add.)
- — (für = f.)
- — (innerhalb = innerh.)
- — (Zauberwirken-Attributsmodifikator = Zauberwirken-Attr.mod.)

### Numbers

The prose transformer converts only standalone number words; compounds, hyphenated forms, ordinals, and larger numbers stay unchanged. For example, `twenty-one`, `tenfold`, and `one-handed` are not matched. Idioms such as `one another` and `no one` are not context-filtered, so their number word is converted. The catalog stops at `ten` and `hundred`; there are no eleven-plus, compound, or ordinal entries.

- zero = 0 (null = 0)
- one = 1 (eins = 1)
- two = 2 (zwei = 2)
- three = 3 (drei = 3)
- four = 4 (vier = 4)
- five = 5 (fünf = 5)
- six = 6 (sechs = 6)
- seven = 7 (sieben = 7)
- eight = 8 (acht = 8)
- nine = 9 (neun = 9)
- ten = 10 (zehn = 10)
- hundred = 100 (hundert = 100)

### Usage conventions

- German multiword abbreviations such as **d. h.**, **u. a.**, **z. B.**, and **z. T.** retain spaces between their abbreviated elements.
- **bzw.** is context-dependent and may mean "respectively", "or rather", or "or" depending on the sentence.
- **o.** is a compact, context-dependent abbreviation and should not be treated as a universally standardized form; **zw.** is a common written abbreviation for *zwischen*.
- **vmtl.** is a compact form of "vermutlich"; **vermutl.** is a more transparent alternative.
- **ca.** and **approx.** indicate approximation, not exact values.
- **etc.** and **usw.** are equivalent in many contexts; both may be retained for bilingual text.
- Duplicate abbreviations are permitted when the surrounding text or display context makes their meaning clear.

## Conventions and disambiguation

- **Spell schools, class codes, and most extended codes are proposed identifiers**, not official standardized D&D abbreviations.
- **R** means reaction; **RIT** means ritual. The official German spell-list marker **R** can also mean ritual, depending on context.
- **R**, **K**, and **M** also occur as markers in official German spell lists: **R** indicates a ritual, **K** indicates concentration, and **M** indicates special material requirements. Their meanings depend on the display context.
- **CON** means Constitution; **Conc.** means Concentration; **CONJ** means Conjuration.
- **rng.** means range; **RNG-R** means Ranger. Avoid reducing both to RNG in a machine-readable map.
- **min** is the time unit minute; **min.**/**Min.** is minimum, and German **mind.** is *mindestens* (at least).
- **Min.** / **Max.** are the capitalized German noun abbreviations for *Minimum* and *Maximum*; English uses lowercase **min.** /**max.**.
- **rnd.** and **Rnd.** are the English and German round abbreviations; **TURN** / **ZUG** remain the turn abbreviations.
- **Z.** remains *Zauber*; **Ggst.** is the singular *Gegenstand*, while **Ggstd.** is the plural *Gegenstände* / *Gegenständen*.
- **b/w** is the English short for *between*; **zw.** is the German short for *zwischen*.
- **RW** means Rettungswurf; **RWt** means Reichweite. This avoids the German collision.
- **M** as a spell component means Material; **m** as a unit means meter. Case matters.
- **Character level (Stufe)** and **spell level** are different concepts.
- **S (English somatic)** corresponds to **G (German Gestenkomponente)**; English spell components **V, S, M** therefore correspond to German **V, G, M**.
- **ft** is the English foot/feet short; German spell ranges are generally given in meters.
- **German ability abbreviations** such as ST, GE, KO, IN, WE, and CH are app-specific shorthand and do not necessarily match the abbreviations printed in the official German SRD.
- **General language abbreviations** may overlap with D&D-specific codes. Their interpretation depends on context.
- **≤** is used only for numeric `up to` / `bis zu` quantities; it is not a replacement for non-numeric phrases such as `up to the DM's discretion`. **≥** is the corresponding `at least` / `mindestens` short; both glyphs depend on the surrounding comparison, so read the adjacent quantity to disambiguate them.
- **Periods and spaces** are significant parts of an abbreviation. For example, `z. B.` and `d. h.` retain their internal spaces.
- **Singular and plural forms** may intentionally share an abbreviation, such as `obj.` for object and objects. German distinguishes **Ggst.** (singular) from **Ggstd.** (plural). Context determines the intended meaning.
- **Written numbers** convert only as standalone words; compounds (`twenty-one`), hyphenated forms (`one-handed`), ordinals, and larger numbers are unchanged.
