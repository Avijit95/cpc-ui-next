// Cross-tab single-flight for /auth/refresh.
// - navigator.locks ensures only one tab calls /auth/refresh at a time.
// - BroadcastChannel shares the result so sibling tabs reuse it (in-memory only;
//   nothing is written to localStorage, so XSS exposure isn't widened).
// - Falls back to direct call where these APIs are unavailable (older Safari, SSR).

import type { RefreshResponse } from "@/lib/api/types";

type RefreshResult = RefreshResponse | null;
type Cached = { result: RefreshResult; at: number };

const CHANNEL_NAME = "cpc-auth-refresh";
const LOCK_NAME = "cpc-auth-refresh";
const FRESH_MS = 10_000;

let channel: BroadcastChannel | null = null;
let lastBroadcast: Cached | null = null;

function ensureChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (channel) return channel;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener("message", (e: MessageEvent<Cached>) => {
    const msg = e.data;
    if (msg && typeof msg.at === "number") lastBroadcast = msg;
  });
  return channel;
}

function consumeFresh():
  | { hit: true; result: RefreshResult }
  | { hit: false } {
  if (!lastBroadcast) return { hit: false };
  if (Date.now() - lastBroadcast.at > FRESH_MS) return { hit: false };
  return { hit: true, result: lastBroadcast.result };
}

function broadcast(result: RefreshResult): void {
  const cached: Cached = { result, at: Date.now() };
  lastBroadcast = cached;
  ensureChannel()?.postMessage(cached);
}

export async function singleFlightRefresh(
  doRefresh: () => Promise<RefreshResult>,
): Promise<RefreshResult> {
  ensureChannel();
  if (typeof navigator === "undefined" || !("locks" in navigator)) {
    return doRefresh();
  }
  return navigator.locks.request(LOCK_NAME, async () => {
    const fresh = consumeFresh();
    if (fresh.hit) return fresh.result;
    const result = await doRefresh();
    broadcast(result);
    return result;
  });
}
