"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Paperclip, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Message {
  id: number;
  from: "me" | string;
  text: string;
  time: string;
}
interface Contact {
  id: string;
  name: string;
  kind: "group" | "dm";
  last: string;
  unread: number;
}

const CONTACTS: Contact[] = [
  { id: "g-frontend", name: "#frontend", kind: "group", last: "Vega: shipped the navbar tweak", unread: 3 },
  { id: "g-design", name: "#design-crit", kind: "group", last: "Lumen: thumbnails look better", unread: 0 },
  { id: "dm-aeris", name: "Aeris Kim", kind: "dm", last: "thanks!! that fix worked", unread: 1 },
  { id: "dm-nimbus", name: "Nimbus Patel", kind: "dm", last: "want to pair on the migration?", unread: 0 },
  { id: "dm-vega", name: "Vega Romero", kind: "dm", last: "lunch?", unread: 0 },
  { id: "dm-lumen", name: "Lumen Chen", kind: "dm", last: "sent the figma file", unread: 0 },
];

const INITIAL_THREADS: Record<string, Message[]> = {
  "dm-aeris": [
    { id: 1, from: "Aeris Kim", text: "hey — got a sec? the build is failing on main", time: "9:41 AM" },
    { id: 2, from: "me", text: "yeah, what's the error?", time: "9:42 AM" },
    { id: 3, from: "Aeris Kim", text: "TS2345 on the new useFrameworks hook. line 23.", time: "9:42 AM" },
    { id: 4, from: "me", text: "ah — the return type changed. you need to await it now.", time: "9:43 AM" },
    { id: 5, from: "Aeris Kim", text: "thanks!! that fix worked 🎉", time: "9:45 AM" },
  ],
  "g-frontend": [
    { id: 1, from: "Vega Romero", text: "shipped the navbar tweak — please ⭐ if it looks right", time: "8:02 AM" },
    { id: 2, from: "Lumen Chen", text: "LGTM, the contrast in dark mode is much better now", time: "8:10 AM" },
    { id: 3, from: "me", text: "nice. is the share-link copy button still there?", time: "8:11 AM" },
    { id: 4, from: "Vega Romero", text: "yep — moved to the right side, behind the menu", time: "8:12 AM" },
  ],
  "g-design": [{ id: 1, from: "Lumen Chen", text: "thumbnails look better — pushed to staging", time: "Yesterday" }],
  "dm-nimbus": [{ id: 1, from: "Nimbus Patel", text: "want to pair on the migration?", time: "Mon" }],
  "dm-vega": [{ id: 1, from: "Vega Romero", text: "lunch?", time: "Mon" }],
  "dm-lumen": [{ id: 1, from: "Lumen Chen", text: "sent the figma file", time: "Sun" }],
};

function initialOf(name: string) {
  const parts = name.replace(/^#/, "").split(/[\s_-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function nowHHMM() {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ChatPreview() {
  const [activeId, setActiveId] = useState("dm-aeris");
  const [filter, setFilter] = useState("");
  const [threads, setThreads] = useState(INITIAL_THREADS);
  const [draft, setDraft] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  const active = CONTACTS.find((c) => c.id === activeId)!;
  const messages = threads[activeId] ?? [];

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return CONTACTS;
    return CONTACTS.filter((c) => c.name.toLowerCase().includes(q));
  }, [filter]);
  const groups = filtered.filter((c) => c.kind === "group");
  const dms = filtered.filter((c) => c.kind === "dm");

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeId]);

  function onSend(e: React.FormEvent) {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    setThreads((prev) => ({
      ...prev,
      [activeId]: [...(prev[activeId] ?? []), { id: Date.now(), from: "me", text: t, time: nowHHMM() }],
    }));
    setDraft("");
  }

  return (
    <div className="border-border bg-background flex h-[32rem] overflow-hidden rounded-md border">
      <aside className="border-border flex w-56 shrink-0 flex-col border-r">
        <div className="border-border border-b p-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search…"
            className="h-8 text-xs"
            aria-label="Filter contacts"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title="Groups" items={groups} activeId={activeId} onSelect={setActiveId} />
          <Section title="Direct messages" items={dms} activeId={activeId} onSelect={setActiveId} />
          {filtered.length === 0 ? (
            <p className="text-muted-foreground px-3 py-4 text-xs">No matches.</p>
          ) : null}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-border flex items-center gap-2 border-b px-3 py-2">
          <Avatar name={active.name} kind={active.kind} small />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{active.name}</p>
            <p className="text-muted-foreground text-[10px]">
              {active.kind === "group" ? "Group · 12 members" : "Active now"}
            </p>
          </div>
        </header>

        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="flex flex-col gap-1.5">
            {messages.map((m) => {
              const mine = m.from === "me";
              return (
                <div key={m.id} className={mine ? "flex justify-end" : "flex items-end gap-1.5"}>
                  {!mine ? <Avatar name={m.from} kind="dm" small /> : null}
                  <div className={"flex max-w-[78%] flex-col " + (mine ? "items-end" : "items-start")}>
                    {!mine ? (
                      <p className="text-muted-foreground mb-0.5 text-[10px]">{m.from}</p>
                    ) : null}
                    <div
                      className={
                        "rounded-2xl px-2.5 py-1.5 text-xs shadow-sm " +
                        (mine
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm")
                      }
                    >
                      {m.text}
                    </div>
                    <p className={"text-muted-foreground mt-0.5 text-[9px] " + (mine ? "text-right" : "")}>
                      {m.time}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <form onSubmit={onSend} className="border-border border-t p-2">
          <div className="bg-muted/40 border-border focus-within:ring-ring/40 flex items-end gap-1 rounded-2xl border p-1.5 focus-within:ring-2">
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Attach file" title="Attach file">
              <Paperclip className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label="Attach image" title="Attach image">
              <ImageIcon className="h-3.5 w-3.5" />
            </Button>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend(e);
                }
              }}
              placeholder={`Message ${active.name}…`}
              rows={1}
              className="placeholder:text-muted-foreground max-h-24 min-h-[2rem] flex-1 resize-none bg-transparent px-2 py-1 text-xs outline-none"
              aria-label="Message"
            />
            <Button type="submit" size="icon" className="h-7 w-7" disabled={!draft.trim()} aria-label="Send message">
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Section({
  title,
  items,
  activeId,
  onSelect,
}: {
  title: string;
  items: Contact[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="px-1.5 py-2">
      <p className="text-muted-foreground px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider">
        {title}
      </p>
      <ul className="flex flex-col gap-0.5">
        {items.map((c) => {
          const isActive = c.id === activeId;
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className={
                  "flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left transition-colors " +
                  (isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/60")
                }
              >
                <Avatar name={c.name} kind={c.kind} small />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{c.name}</p>
                  <p className="text-muted-foreground truncate text-[10px]">{c.last}</p>
                </div>
                {c.unread > 0 ? (
                  <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0 text-[9px] font-medium">
                    {c.unread}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Avatar({ name, kind, small }: { name: string; kind: "group" | "dm"; small?: boolean }) {
  const size = small ? "h-6 w-6 text-[9px]" : "h-8 w-8 text-[11px]";
  const palette =
    kind === "group"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${size} ${palette}`}
      aria-hidden
    >
      {initialOf(name)}
    </span>
  );
}
