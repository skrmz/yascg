import { describe, expect, it } from "vite-plus/test";
import { isMateriallyShorter, isRuntimeEligible, joinField } from "./material-shortening.ts";

const SOURCE = {
  description: ["A long description that repeats itself.", "It also has a second paragraph."],
  higherLevels: ["The damage increases by one die for each slot level above third."],
};

describe("material shortening", () => {
  it("joins array items with a blank line", () => {
    expect(joinField(["a", "b"])).toBe("a\n\nb");
    expect(joinField(undefined)).toBe("");
  });

  it("uses the 10% threshold per field", () => {
    expect(isMateriallyShorter("x".repeat(90), "x".repeat(100))).toBe(true);
    expect(isMateriallyShorter("x".repeat(91), "x".repeat(100))).toBe(false);
  });

  it("is eligible when the description is materially shorter", () => {
    expect(isRuntimeEligible({ description: "Short." }, SOURCE)).toBe(true);
  });

  it("is eligible when only the higher levels are materially shorter", () => {
    expect(
      isRuntimeEligible(
        { description: joinField(SOURCE.description), higherLevels: "+1d6 per level." },
        SOURCE,
      ),
    ).toBe(true);
  });

  it("is not eligible when neither replaced field is materially shorter", () => {
    expect(
      isRuntimeEligible(
        {
          description: joinField(SOURCE.description),
          higherLevels: joinField(SOURCE.higherLevels),
        },
        SOURCE,
      ),
    ).toBe(false);
  });

  it("ignores an omitted higher-level candidate", () => {
    expect(isRuntimeEligible({ description: joinField(SOURCE.description) }, SOURCE)).toBe(false);
  });
});
