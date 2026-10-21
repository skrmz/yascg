export const en = {
  spell: {
    metadata: {
      castingTime: "Casting Time",
      range: "Range",
      components: "Components",
      duration: "Duration",
      material: "Material",
      classes: "Classes",
    },
    higherLevels: "Higher Levels",
    level: {
      cantrip: "Cantrip",
      level: "Level {{level}}",
    },
    flag: {
      concentration: "Concentration",
      ritual: "Ritual",
    },
  },
  component: {
    verbal: "V",
    somatic: "S",
    material: "M",
  },
  damageType: {
    acid: "Acid",
    bludgeoning: "Bludgeoning",
    cold: "Cold",
    fire: "Fire",
    force: "Force",
    lightning: "Lightning",
    necrotic: "Necrotic",
    piercing: "Piercing",
    poison: "Poison",
    psychic: "Psychic",
    radiant: "Radiant",
    slashing: "Slashing",
    thunder: "Thunder",
  },
  school: {
    abjuration: "Abjuration",
    conjuration: "Conjuration",
    divination: "Divination",
    enchantment: "Enchantment",
    evocation: "Evocation",
    illusion: "Illusion",
    necromancy: "Necromancy",
    transmutation: "Transmutation",
  },
  class: {
    bard: "Bard",
    cleric: "Cleric",
    druid: "Druid",
    paladin: "Paladin",
    ranger: "Ranger",
    sorcerer: "Sorcerer",
    warlock: "Warlock",
    wizard: "Wizard",
  },
  card: {
    truncated: "Content truncated",
    continuedFrom: "Continued from Card {{index}}",
    continuation: "Card {{index}} of {{count}}",
  },
  form: {
    title: {
      new: "New custom spell",
      edit: "Edit custom spell",
    },
    description: "Custom spells are stored locally and never modify bundled SRD data.",
    name: "Name",
    level: "Level (0-9)",
    school: "School",
    verbal: "Verbal",
    somatic: "Somatic",
    material: "Material",
    materialDescription: "Material description",
    classes: "Classes (comma-separated)",
    descriptionField: "Description (Markdown)",
    higherLevels: "Higher levels (Markdown, optional)",
    save: "Save spell",
    error: {
      castingTime: "Casting time must be at most {{max}} characters.",
      range: "Range must be at most {{max}} characters.",
      duration: "Duration must be at most {{max}} characters.",
    },
  },
} as const;

type DeepString<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepString<T[K]>;
};

export type Translations = DeepString<typeof en>;
