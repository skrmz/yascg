/**
 * Extracts unique values for specified properties from a JSON file (e.g., spells).
 *
 * Usage:
 *   node scripts/extract_from_spells.ts <path-to-json> [properties...]
 *
 * Examples:
 *   # Default: extracts unique "name" values
 *   node scripts/extract_from_spells.ts ./data/srd/srd-spells-2024.json
 *
 *   # Extract multiple properties (space-separated or comma-separated):
 *   node scripts/extract_from_spells.ts ./data/srd/srd-spells-2024.json casting_time duration range attack_type
 *   node scripts/extract_from_spells.ts ./data/srd/srd-spells-2024.json casting_time,duration,range
 *
 *   # Show help:
 *   node scripts/extract_from_spells.ts --help
 */

import fs from "node:fs";
import path from "node:path";

interface SpellItem {
  [key: string]: unknown;
}

function formatValue(val: unknown): string {
  if (typeof val === "string") {
    return val.trim();
  }
  if (typeof val === "number" || typeof val === "boolean") {
    return String(val);
  }
  if (typeof val === "object" && val !== null) {
    return JSON.stringify(val);
  }
  return "";
}

function printUsage(): void {
  console.log(`
Usage:
  node scripts/extract_from_spells.ts <path-to-json> [properties...]

Options:
  -h, --help    Show this help message and exit

Arguments:
  <path-to-json>  Path to the input JSON file (required)
  [properties...] One or more object keys to extract (default: "name")
                  Can be passed space-separated or comma-separated

Examples:
  node scripts/extract_from_spells.ts ./data/srd/srd-spells-2024.json
  node scripts/extract_from_spells.ts ./data/srd/srd-spells-2024.json casting_time duration range attack_type
  node scripts/extract_from_spells.ts ./data/srd/srd-spells-2024.json name,casting_time,range
`);
}

const args = process.argv.slice(2);

// Handle help request
if (args.includes("-h") || args.includes("--help")) {
  printUsage();
  process.exit(0);
}

// Validate arguments
if (args.length === 0) {
  console.error("Error: Missing input file argument.");
  printUsage();
  process.exit(1);
}

const unknownFlag = args.find((arg) => arg.startsWith("-"));
if (unknownFlag) {
  console.error(`Error: Unknown option '${unknownFlag}'.`);
  printUsage();
  process.exit(1);
}

const inputFile = args[0];
const propertyArgs = args.slice(1);

// Parse properties (supports both space-separated and comma-separated properties)
const properties =
  propertyArgs.length > 0
    ? propertyArgs
        .flatMap((p) => p.split(","))
        .map((p) => p.trim())
        .filter(Boolean)
    : ["name"];

try {
  const filePath = path.resolve(inputFile);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at '${filePath}'`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(filePath, "utf8");
  const items: unknown = JSON.parse(rawData);

  if (!Array.isArray(items)) {
    console.error("Error: Input JSON must be an array of objects.");
    process.exit(1);
  }

  properties.forEach((prop, index) => {
    const uniqueValues = new Set<string>();

    for (const item of items) {
      if (!item || typeof item !== "object") continue;

      const record = item as SpellItem;
      const value = record[prop];

      if (value === undefined || value === null) continue;

      // Flatten arrays if a property contains an array of values (e.g. tags or components)
      if (Array.isArray(value)) {
        for (const entry of value) {
          const formatted = formatValue(entry);
          if (formatted !== "") {
            uniqueValues.add(formatted);
          }
        }
      } else {
        const formatted = formatValue(value);
        if (formatted !== "") {
          uniqueValues.add(formatted);
        }
      }
    }

    const sortedValues = Array.from(uniqueValues).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    );

    const formattedList = sortedValues.join("; ");
    console.log(`unique ${prop} (${sortedValues.length}): ${formattedList}`);

    // Output <br> between multiple properties
    if (index < properties.length - 1) {
      console.log("<br>");
    }
  });
} catch (error) {
  if (error instanceof Error) {
    console.error(`Error reading file: ${error.message}`);
  } else {
    console.error("An unknown error occurred:", error);
  }
  process.exit(1);
}
