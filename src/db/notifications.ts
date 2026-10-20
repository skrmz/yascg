export type ChangeKind = "active-deck" | "saved-decks" | "custom-spells";

export interface ChangeMessage {
  kind: ChangeKind;
  at: number;
}

const CHANNEL_NAME = "spell-cards-generator-changes";

let sharedChannel: BroadcastChannel | null = null;
let sharedChannelAttempted = false;

function getChannel(): BroadcastChannel | null {
  if (sharedChannelAttempted) return sharedChannel;
  sharedChannelAttempted = true;
  try {
    if (typeof BroadcastChannel === "undefined") return null;
    sharedChannel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    sharedChannel = null;
  }
  return sharedChannel;
}

/** Advisory cross-tab notification. Revision compare-and-swap remains authoritative. */
export function publishChange(kind: ChangeKind): void {
  const channel = getChannel();
  if (!channel) return;
  try {
    const message: ChangeMessage = { kind, at: Date.now() };
    channel.postMessage(message);
  } catch {
    // Advisory only.
  }
}

export function subscribeToChanges(listener: (message: ChangeMessage) => void): () => void {
  const channel = getChannel();
  if (!channel) return () => undefined;
  const handler = (event: MessageEvent<ChangeMessage>) => {
    const data = event.data;
    if (data && typeof data.kind === "string") listener(data);
  };
  channel.addEventListener("message", handler);
  return () => channel.removeEventListener("message", handler);
}
