"use client";

import { useEffect, useRef, useState } from "react";
import { Settings, Check, X, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPat, setPat, clearPat } from "@/lib/pat";

export function PatSettings() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [val, setVal] = useState("");
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "bad" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  const hasToken = mounted && !!getPat();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openPanel() {
    setVal(getPat() ?? "");
    setSaved(false);
    setTestResult(null);
    setShow(false);
    setOpen((o) => !o);
  }

  async function test() {
    const t = val.trim();
    if (!t) return;
    setTesting(true);
    setTestResult(null);
    try {
      // A token that can read the authenticated user is valid for our syncs.
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${t}` },
      });
      setTestResult(res.ok ? "ok" : "bad");
    } catch {
      setTestResult("bad");
    } finally {
      setTesting(false);
    }
  }

  function save() {
    const t = val.trim();
    if (!t) return;
    setPat(t);
    setSaved(true);
    setTestResult(null);
  }

  function remove() {
    clearPat();
    setVal("");
    setSaved(false);
    setTestResult(null);
  }

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="GitHub settings"
        title={hasToken ? "GitHub token set" : "Set a GitHub token (optional)"}
        onClick={openPanel}
        className={`size-8 ${hasToken ? "text-st-done" : "text-text-faint hover:text-foreground"}`}
      >
        <Settings className="size-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-80 rounded-xl border border-border bg-popover p-3.5 shadow-lg">
          <div className="mb-1 px-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint">
            GitHub token
          </div>
          <p className="mb-2 px-1.5 text-[11.5px] leading-snug text-muted-foreground">
            Optional. Deck uses your local <span className="font-mono">gh</span> login by default. Set a Personal
            Access Token to sync without it (or on a hosted instance). Stored only in this browser; never sent
            anywhere except to GitHub.
          </p>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <input
                type={show ? "text" : "password"}
                value={val}
                onChange={(e) => {
                  setVal(e.target.value);
                  setSaved(false);
                  setTestResult(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder="ghp_… or github_pat_…"
                className="h-8 w-full rounded-md border border-hairline bg-card px-2.5 pr-8 font-mono text-[12px] text-foreground outline-none focus:border-primary"
              />
              <button
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide token" : "Show token"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-faint hover:text-foreground"
              >
                {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <button
              onClick={save}
              disabled={!val.trim()}
              className="flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11.5px] font-medium text-primary-foreground transition hover:brightness-110 disabled:opacity-40"
            >
              <Check className="size-3" />
              Save
            </button>
            <button
              onClick={test}
              disabled={!val.trim() || testing}
              className="h-7 rounded-md border border-hairline px-2.5 text-[11.5px] text-muted-foreground transition hover:text-foreground disabled:opacity-40"
            >
              {testing ? "Testing…" : "Test"}
            </button>
            {hasToken && (
              <button
                onClick={remove}
                className="flex h-7 items-center gap-1 rounded-md border border-hairline px-2.5 text-[11.5px] text-text-faint transition hover:text-st-blocked"
              >
                <X className="size-3" />
                Clear
              </button>
            )}
            {saved && <span className="text-[11px] text-st-done">Saved</span>}
            {testResult === "ok" && <span className="text-[11px] text-st-done">Token works</span>}
            {testResult === "bad" && <span className="text-[11px] text-st-blocked">Invalid token</span>}
          </div>
          <p className="mt-2 px-1.5 text-[10.5px] leading-snug text-text-faint">
            Needs <span className="font-mono">repo</span> scope. Create one at github.com/settings/tokens.
          </p>
        </div>
      )}
    </div>
  );
}
