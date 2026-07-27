"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useTheme } from "next-themes";
import { RefreshCw, Plus, CornerDownRight, Bell, Star, Palette } from "lucide-react";
import { useItems } from "@/hooks/use-items";
import { useViews } from "@/hooks/use-views";
import { THEMES } from "@/components/theme/theme-picker";
import type { ItemFilters } from "@/lib/types";

export function CommandPalette({
  onOpenItem,
  revalidate,
  setFilters,
}: {
  onOpenItem: (id: number) => void;
  revalidate: () => void;
  setFilters: (f: ItemFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { items } = useItems({});
  const { views } = useViews();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function close() {
    setOpen(false);
    setSearch("");
  }

  async function quickAdd() {
    const t = search.trim();
    if (!t) return;
    await fetch("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: t, type: "task", status: "todo" }),
    });
    revalidate();
    close();
  }

  async function sync() {
    close();
    await fetch("/api/sync", { method: "POST" });
    revalidate();
  }

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Command menu">
      <Command.Input value={search} onValueChange={setSearch} placeholder="Search tasks or run a command…" />
      <Command.List>
        <Command.Empty>No results.</Command.Empty>

        {search.trim() && (
          <Command.Group heading="Create">
            <Command.Item value={`create ${search}`} onSelect={quickAdd}>
              <Plus />
              Create task: “{search.trim()}”
            </Command.Item>
          </Command.Group>
        )}

        <Command.Group heading="Actions">
          <Command.Item value="sync from github" onSelect={sync}>
            <RefreshCw />
            Sync from GitHub
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Theme">
          {THEMES.map((t) => (
            <Command.Item
              key={t.id}
              value={`theme ${t.name}`}
              onSelect={() => {
                setTheme(t.id);
                close();
              }}
            >
              <Palette />
              {t.name}
              {theme === t.id && <span className="ml-auto text-[11px] text-text-faint">current</span>}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Views">
          <Command.Item
            value="needs attention"
            onSelect={() => {
              setFilters({ needsAttention: true });
              close();
            }}
          >
            <Bell />
            Needs attention
          </Command.Item>
          {views.map((v) => (
            <Command.Item
              key={v.id}
              value={`view ${v.name}`}
              onSelect={() => {
                setFilters(v.filter);
                close();
              }}
            >
              <Star />
              {v.name}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading="Jump to">
          {items.map((i) => (
            <Command.Item
              key={i.id}
              value={`${i.title} ${i.status} ${i.type}`}
              onSelect={() => {
                onOpenItem(i.id);
                close();
              }}
            >
              <CornerDownRight />
              {i.title}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
