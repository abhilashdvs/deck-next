"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Palette, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export const THEMES = [
  { id: "light", name: "Light", sw: ["#ffffff", "#6b62e0", "#2fa37a"] },
  { id: "dark", name: "Dark", sw: ["#0c0d11", "#8b85f0", "#5fbf95"] },
  { id: "midnight", name: "Midnight", sw: ["#16161e", "#7aa2f7", "#9ece6a"] },
  { id: "dracula", name: "Dracula", sw: ["#282a36", "#bd93f9", "#50fa7b"] },
  { id: "rosepine", name: "Rosé Pine", sw: ["#191724", "#c4a7e7", "#9ccfd8"] },
];

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setMounted(true), []);

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

  const current = mounted ? theme : undefined;

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Change theme"
        title="Change theme"
        className="size-8 text-text-faint hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        <Palette className="size-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-52 rounded-xl border border-border bg-popover p-2 shadow-lg">
          <div className="mb-1 px-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint">
            Theme
          </div>
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTheme(t.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] transition ${
                current === t.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-card-hover hover:text-foreground"
              }`}
            >
              <span className="flex overflow-hidden rounded-md border border-hairline">
                {t.sw.map((c, i) => (
                  <span key={i} className="size-3.5" style={{ background: c }} />
                ))}
              </span>
              {t.name}
              {current === t.id && <Check className="ml-auto size-3.5 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
