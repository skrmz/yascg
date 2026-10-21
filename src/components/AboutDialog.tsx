import { Info } from "lucide-react";
import { Button } from "@/ui/Button.tsx";
import { Dialog, DialogContent, DialogTrigger } from "@/ui/Dialog.tsx";

export const SRD_ATTRIBUTION =
  "This work includes material from the System Reference Document 5.2.1 (\u201cSRD 5.2.1\u201d) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/.";

export function AboutDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="About and attribution">
          <Info size={16} aria-hidden="true" />
          About
        </Button>
      </DialogTrigger>
      <DialogContent title="About YASCG - Yet Another Spell Card Generator">
        <div className="space-y-3">
          <p>
            An offline-first generator for Dungeons &amp; Dragons 5.5e (2024) spell cards. Bundled
            spells are limited to the SRD 5.2.1. Custom spells are labeled <strong>Custom</strong>;
            bundled spells are labeled <strong>SRD 5.2.1</strong>.
          </p>
          <p className="rounded border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            {SRD_ATTRIBUTION}
          </p>
          <p className="text-xs text-muted-foreground">
            This application is not affiliated with, endorsed by, or sponsored by Wizards of the
            Coast. Data is stored locally in your browser; export your spells and decks as JSON to
            keep a backup.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
