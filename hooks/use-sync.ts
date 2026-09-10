"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { authHeaders } from "@/lib/pat";

export function useSync(onDone: () => void) {
  const [syncing, setSyncing] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const syncingRef = useRef(false);

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      await fetch("/api/sync", { method: "POST", headers: authHeaders() });
      onDoneRef.current();
    } catch {
      // ignore; board keeps polling
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  // Auto-sync: shortly after load, then every 2 minutes.
  useEffect(() => {
    const t = setTimeout(sync, 8000);
    const iv = setInterval(sync, 2 * 60 * 1000);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [sync]);

  return { syncing, sync };
}
