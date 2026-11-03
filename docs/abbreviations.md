
# D&D 5e Spell Card Abbreviations (English / Deutsch)

Based on D&D 5e terminology (German SRD 5.2.1 / 2024 rules). The terms follow the rules; **abbreviations are a mix of conventional D&D shorthand and proposed, app-specific shorthand**. They are not all official identifiers. Abbreviations are case-sensitive.

This catalog contains D&D terminology, spell-card-specific shorthand, and common language abbreviations. It serves as the single runtime source for all abbreviations.

Abbreviations may contain periods, spaces, or special characters. Duplicate abbreviations are permitted when their meanings can be distinguished by context. They are not guaranteed to be globally unique or reversible.

Compact cards use fixed action/indicator badges with the catalog `.full` meaning in tooltips and the legend, while footer/component abbreviations display the catalog `.short` value.

The parity test reads only lines matching the `- full = short (full = short)` format. Catalog entry counts should be derived automatically rather than maintained manually.

## Manual abbreviation of custom spell prose

The custom spell editor offers **Abbreviate** for non-SRD drafts. The action transforms only the user-authored draft values (`description`, higher levels, casting time, range, duration, and component descriptions); it never changes UI labels or structured fields. Nothing is persisted until the spell is saved, and **Undo abbreviation** restores the fields changed by the latest action until the editor closes. See the [custom spells guide](custom-spells-guide.md) for the user workflow.

Matching uses the language captured when the editor opened. Only exact `en` and `de` codes have catalogs; other languages are a no-op with an explanatory status, never an English fallback. Catalog identity and display remain case-sensitive: `m` (meter) and `M` (material component) are distinct. Manual prose matching is locale-aware case-insensitive, so `Bonus Action`, `BONUS ACTION`, and `bonus action` share the `BA` short.

Only catalog `full` terms are eligible, and longer phrases win. Whitespace is not collapsed and plurals are matched only through explicit catalog entries such as `minutes`, `hours`, and `meters`. The German word `Meter` is both singular and plural, so the `meter` and `meters` rows intentionally share the same German signature. No-op entries whose short is not shorter than their full form (`spell`, `self`, `touch`, `sight`, `hit`, `Selbst`, `Sicht`) are never eligible.

The following exclusions are policy, not algorithm. Removing an entry from this list is a product decision; it does not require a matcher change.

- English exclusions: `round`, `turn`, `line`, `speed`, `advantage`, `disadvantage`, `target`, `object`, `objects`, `bonus`, `minimum`, `maximum`, `example`, `presumably`, `compare`, `possibly`, `in part`, `or`, `between`.
- German exclusions: `Runde`, `Zug`, `Linie`, `Vorteil`, `Nachteil`, `Ziel`, `Gegenstand`, `Gegenstände`, `Bonus`, `Minimum`, `Maximum`, `vermutlich`, `vergleiche`, `oder`, `zwischen`, `Durchmesser`, `Würfel`.

English and German therefore differ deliberately: `Bewegungsrate` remains eligible in German, while the English `speed` is excluded. `action`, `reaction`, and `damage` (and `Aktion`, `Reaktion`, `Schaden`) are eligible as approved standalone game terms; longer phrases such as `bonus action` and `damage resistance` still win.

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
- proficiency bonus = PB (Übungsbonus = ÜB)
- initiative = INIT (Initiative = INIT)
- speed = SPD (Bewegungsrate = BR)
- advantage = ADV (Vorteil = VT)
- disadvantage = DIS (Nachteil = NT)
- attack roll = ATK (Angriffswurf = AW)
- damage = dmg (Schaden = SCH)
- damage resistance = RES (Schadensresistenz = RES)
- damage immunity = IMM (Schadensimmunität = IMM)
- vulnerability = VUL (Schadensanfälligkeit = ANF)
- spell = Spell (Zauber = Z.)
- spell attack = SATK (Zauberangriff = ZAng.)
- spell save DC = SSDC (SG für Zauberrettungswürfe = Z-SG)
- spell slot = SLOT (Zauberplatz = ZP)
- cantrip = CTP (Zaubertrick = ZT)
- ritual = RIT (Ritual = RIT)
- concentration = Conc. (Konzentration = Konz.)
- verbal component = V (Verbalkomponente = V)
- somatic component = S (Gestenkomponente = G)
- material component = M (Materialkomponente = M)
- action = A (Aktion = A)
- bonus action = BA (Bonusaktion = BA)
- reaction = R (Reaktion = R)
- round = RD (Runde = RD)
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
- range = RNG (Reichweite = RWt)
- duration = DUR (Wirkungsdauer = WD)
- character level = lvl (Charakterstufe = Stf.)
- casting at higher levels = UPCAST (Verwenden von Zauberplätzen höheren Grades = Grad+)
- cantrip upgrade = CTP+ (Zaubertrick-Aufwertung = ZT+)
- instantaneous = inst. (Unmittelbar = unm.)
- until dispelled = disp. (Bis gebannt = bis geb.)
- until the end of the next turn = EONT (Bis zum Ende des nächsten Zugs = bis EZ)
- until the start of the next turn = SONT (Bis zum Beginn des nächsten Zugs = bis BZ)
- self = SELF (Selbst = Selbst)
- touch = TOUCH (Berührung = Ber.)
- sight = SIGHT (Sicht = Sicht)
- target = tgt. (Ziel = Ziel)
- object = obj. (Gegenstand = Ggst.)
- objects = obj. (Gegenstände = Ggst.)
- radius = rad. (Radius = Rad.)
- diameter = dia. (Durchmesser = Durchm.)
- sphere = sphere (Kugel = Kug.)
- cube = cube (Würfel = Wwürf.)
- cone = cone (Kegel = Kegel)
- cylinder = cyl. (Zylinder = Zyl.)
- line = line (Linie = Linie)
- emanation = EMAN (Emanation = Eman.)
- foot = ft (Fuß = Fuß)
- feet = ft (Fuß = Fuß)
- meter = mtr (Meter = m)
- meters = mtr (Meter = m)
- minute = min (Minute = min)
- minutes = min (Minuten = min)
- hour = h (Stunde = h)
- hours = h (Stunden = h)
- day = d (Tag = t)
- bonus = bonus (Bonus = Bonus)
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
- psychic = psyc. (psychischer = psych.)
- psychic = psyc. (psychischen = psych.)
- psychic damage = PSYC (Psychischer Schaden = PSY)
- radiant damage = RADI (Gleißender Schaden = GLEISS)
- slashing damage = SLAS (Hiebschaden = HIEB)
- thunder damage = THUN (Schallschaden = SCHALL)

## General language abbreviations

Common abbreviations for everyday language, descriptive text, and explanatory notes. These are not D&D-specific terms. German abbreviations follow common written usage where possible; some compact forms are app-specific. English and German abbreviations are not necessarily interchangeable in meaning or usage.

- example = ex. (Beispiel = Bsp.)
- or = or (oder = o.)
- respectively / or rather = resp. (beziehungsweise = bzw.)
- between = between (zwischen = zw.)
- presumably = presum. (vermutlich = vmtl.)
- that is = i.e. (das heißt = d. h.)
- among others = a.o. (unter anderem = u. a.)
- for example = e.g. (zum Beispiel = z. B.)
- and so on = etc. (und so weiter = usw.)
- et cetera = etc. (et cetera = etc.)
- so-called = so-called (sogenannt = sog.)
- compare = cf. (vergleiche = vgl.)
- approximately = approx. (circa = ca.)
- possibly = poss. (eventuell = evtl.)
- in part = partly (zum Teil = z. T.)
- hit = hit (Treffer = Trf.)
- attribute = attr. (Attribut = Attr.)
- spell casting modifier = spell mod. (Zauber-Attributsmodifikator = Z.-Attr.Mod.)

### Usage conventions

- German multiword abbreviations such as **d. h.**, **u. a.**, **z. B.**, and **z. T.** retain spaces between their abbreviated elements.
- **bzw.** is context-dependent and may mean "respectively", "or rather", or "or" depending on the sentence.
- **o.** and **zw.** are compact, context-dependent abbreviations and should not be treated as universally standardized forms.
- **vmtl.** is a compact form of "vermutlich"; **vermutl.** is a more transparent alternative.
- **ca.** and **approx.** indicate approximation, not exact values.
- **etc.** and **usw.** are equivalent in many contexts; both may be retained for bilingual text.
- Duplicate abbreviations are permitted when the surrounding text or display context makes their meaning clear.

## Conventions and disambiguation

- **Spell schools, class codes, and most extended codes are proposed identifiers**, not official standardized D&D abbreviations.
- **R** means reaction; **RIT** means ritual. The official German spell-list marker **R** can also mean ritual, depending on context.
- **R**, **K**, and **M** also occur as markers in official German spell lists: **R** indicates a ritual, **K** indicates concentration, and **M** indicates special material requirements. Their meanings depend on the display context.
- **CON** means Constitution; **Conc.** means Concentration; **CONJ** means Conjuration.
- **RNG** means range; **RNG-R** means Ranger. Avoid reducing both to RNG in a machine-readable map.
- **min** is the time unit minute; **min.**/**Min.** is minimum.
- **RW** means Rettungswurf; **RWt** means Reichweite. This avoids the German collision.
- **M** as a spell component means Material; **m** as a unit means meter. Case matters.
- **Character level (Stufe)** and **spell level** are different concepts.
- **S (English somatic)** corresponds to **G (German Gestenkomponente)**; English spell components **V, S, M** therefore correspond to German **V, G, M**.
- **ft** is the English foot/feet short; German spell ranges are generally given in meters.
- **German ability abbreviations** such as ST, GE, KO, IN, WE, and CH are app-specific shorthand and do not necessarily match the abbreviations printed in the official German SRD.
- **General language abbreviations** may overlap with D&D-specific codes. Their interpretation depends on context.
- **Periods and spaces** are significant parts of an abbreviation. For example, `z. B.` and `d. h.` retain their internal spaces.
- **Singular and plural forms** may intentionally share an abbreviation, such as `obj.` for object and objects. Context determines the intended meaning.
