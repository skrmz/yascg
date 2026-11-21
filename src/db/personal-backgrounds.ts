import type { PersonalBackground } from "@/cards/personal-backgrounds.ts";
import { AppError, message } from "@/locales/messages.ts";
import { publishChange } from "./notifications.ts";
import { db } from "./database.ts";
import { writeCollection } from "./collection-state.ts";

export async function addPersonalBackground(background: PersonalBackground, generation: string) {
  await writeCollection(generation, [db.personalBackgrounds], async (changed) => {
    await db.personalBackgrounds.add(background);
    changed();
  });
  publishChange("personal-backgrounds");
}

export async function savePersonalBackgroundSelection(id: string | null, generation: string) {
  await writeCollection(generation, [db.personalBackgrounds], async (changed, metadata) => {
    if ((metadata.personalBackgroundId ?? null) === id) return;
    if (id && !(await db.personalBackgrounds.where("id").equals(id).firstKey())) {
      throw new AppError(message("card.background.notFound"));
    }
    if (id) metadata.personalBackgroundId = id;
    else delete metadata.personalBackgroundId;
    changed();
  });
  publishChange("personal-backgrounds");
}

export async function removePersonalBackground(id: string, generation: string) {
  await writeCollection(generation, [db.personalBackgrounds], async (changed, metadata) => {
    if (!(await db.personalBackgrounds.where("id").equals(id).firstKey())) return;
    await db.personalBackgrounds.delete(id);
    if (metadata.personalBackgroundId === id) {
      delete metadata.personalBackgroundId;
    }
    changed();
  });
  publishChange("personal-backgrounds");
}
