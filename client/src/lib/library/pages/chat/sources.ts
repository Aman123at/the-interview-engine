import type { ReactVariantSources } from "../../types";

const DATA = `interface Message { id: number; from: "me" | string; text: string; time: string; }
interface Contact { id: string; name: string; kind: "group" | "dm"; last: string; unread: number; }

const CONTACTS: Contact[] = [
  { id: "g-frontend",  name: "#frontend",     kind: "group", last: "Vega: shipped the navbar tweak",        unread: 3 },
  { id: "g-design",    name: "#design-crit",  kind: "group", last: "Lumen: thumbnails look much better",     unread: 0 },
  { id: "g-standup",   name: "#daily-standup",kind: "group", last: "Orbit: PR review at 3pm",                 unread: 0 },
  { id: "dm-aeris",    name: "Aeris Kim",     kind: "dm",    last: "thanks!! that fix worked",               unread: 1 },
  { id: "dm-nimbus",   name: "Nimbus Patel",  kind: "dm",    last: "want to pair on the migration?",         unread: 0 },
  { id: "dm-vega",     name: "Vega Romero",   kind: "dm",    last: "lunch?",                                 unread: 0 },
  { id: "dm-lumen",    name: "Lumen Chen",    kind: "dm",    last: "sent the figma file",                    unread: 0 },
  { id: "dm-orbit",    name: "Orbit Singh",   kind: "dm",    last: "see you tomorrow",                       unread: 0 },
];

const INITIAL_THREADS: Record<string, Message[]> = {
  "dm-aeris": [
    { id: 1, from: "Aeris Kim", text: "hey — got a sec? the build is failing on main",          time: "9:41 AM" },
    { id: 2, from: "me",        text: "yeah, what's the error?",                                  time: "9:42 AM" },
    { id: 3, from: "Aeris Kim", text: "TS2345 on the new useFrameworks hook. line 23.",          time: "9:42 AM" },
    { id: 4, from: "me",        text: "ah — the return type changed. you need to await it now.", time: "9:43 AM" },
    { id: 5, from: "Aeris Kim", text: "thanks!! that fix worked",                                 time: "9:45 AM" },
  ],
  "g-frontend": [
    { id: 1, from: "Vega Romero", text: "shipped the navbar tweak — please ⭐ if it looks right",  time: "8:02 AM" },
    { id: 2, from: "Lumen Chen",  text: "LGTM, the contrast in dark mode is much better now",       time: "8:10 AM" },
    { id: 3, from: "me",          text: "nice. is the share-link copy button still there?",          time: "8:11 AM" },
    { id: 4, from: "Vega Romero", text: "yep — moved to the right side, behind the menu",            time: "8:12 AM" },
  ],
  "g-design":   [{ id: 1, from: "Lumen Chen", text: "thumbnails look much better — pushed to staging", time: "Yesterday" }],
  "g-standup":  [{ id: 1, from: "Orbit Singh", text: "PR review at 3pm — anyone NOT coming?",            time: "Mon" }],
  "dm-nimbus":  [{ id: 1, from: "Nimbus Patel", text: "want to pair on the migration?",                  time: "Mon" }],
  "dm-vega":    [{ id: 1, from: "Vega Romero",  text: "lunch?",                                          time: "Mon" }],
  "dm-lumen":   [{ id: 1, from: "Lumen Chen",   text: "sent the figma file",                             time: "Sun" }],
  "dm-orbit":   [{ id: 1, from: "Orbit Singh",  text: "see you tomorrow",                                time: "Sun" }],
};

function initial(name: string) {
  const parts = name.replace(/^#/, "").split(/[\\s_-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}`;

const DATA_JS = `const CONTACTS = [
  { id: "g-frontend",  name: "#frontend",     kind: "group", last: "Vega: shipped the navbar tweak",        unread: 3 },
  { id: "g-design",    name: "#design-crit",  kind: "group", last: "Lumen: thumbnails look much better",     unread: 0 },
  { id: "g-standup",   name: "#daily-standup",kind: "group", last: "Orbit: PR review at 3pm",                 unread: 0 },
  { id: "dm-aeris",    name: "Aeris Kim",     kind: "dm",    last: "thanks!! that fix worked",               unread: 1 },
  { id: "dm-nimbus",   name: "Nimbus Patel",  kind: "dm",    last: "want to pair on the migration?",         unread: 0 },
  { id: "dm-vega",     name: "Vega Romero",   kind: "dm",    last: "lunch?",                                 unread: 0 },
  { id: "dm-lumen",    name: "Lumen Chen",    kind: "dm",    last: "sent the figma file",                    unread: 0 },
  { id: "dm-orbit",    name: "Orbit Singh",   kind: "dm",    last: "see you tomorrow",                       unread: 0 },
];

const INITIAL_THREADS = {
  "dm-aeris": [
    { id: 1, from: "Aeris Kim", text: "hey — got a sec? the build is failing on main",          time: "9:41 AM" },
    { id: 2, from: "me",        text: "yeah, what's the error?",                                  time: "9:42 AM" },
    { id: 3, from: "Aeris Kim", text: "TS2345 on the new useFrameworks hook. line 23.",          time: "9:42 AM" },
    { id: 4, from: "me",        text: "ah — the return type changed. you need to await it now.", time: "9:43 AM" },
    { id: 5, from: "Aeris Kim", text: "thanks!! that fix worked",                                 time: "9:45 AM" },
  ],
  "g-frontend": [
    { id: 1, from: "Vega Romero", text: "shipped the navbar tweak — please ⭐ if it looks right",  time: "8:02 AM" },
    { id: 2, from: "Lumen Chen",  text: "LGTM, the contrast in dark mode is much better now",       time: "8:10 AM" },
    { id: 3, from: "me",          text: "nice. is the share-link copy button still there?",          time: "8:11 AM" },
    { id: 4, from: "Vega Romero", text: "yep — moved to the right side, behind the menu",            time: "8:12 AM" },
  ],
  "g-design":   [{ id: 1, from: "Lumen Chen", text: "thumbnails look much better — pushed to staging", time: "Yesterday" }],
  "g-standup":  [{ id: 1, from: "Orbit Singh", text: "PR review at 3pm — anyone NOT coming?",            time: "Mon" }],
  "dm-nimbus":  [{ id: 1, from: "Nimbus Patel", text: "want to pair on the migration?",                  time: "Mon" }],
  "dm-vega":    [{ id: 1, from: "Vega Romero",  text: "lunch?",                                          time: "Mon" }],
  "dm-lumen":   [{ id: 1, from: "Lumen Chen",   text: "sent the figma file",                             time: "Sun" }],
  "dm-orbit":   [{ id: 1, from: "Orbit Singh",  text: "see you tomorrow",                                time: "Sun" }],
};

function initial(name) {
  const parts = name.replace(/^#/, "").split(/[\\s_-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}`;

export const sources: ReactVariantSources = {
  "shadcn-tailwind": {
    notes:
      "Install: npx shadcn@latest add input button card\nPlace under src/ChatPage.tsx.",
    files: [
      {
        filename: "ChatPage.tsx",
        language: "tsx",
        code: `import { useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Paperclip, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

${DATA}

export default function ChatPage() {
  const [activeId, setActiveId] = useState<string>("dm-aeris");
  const [filter, setFilter] = useState("");
  const [threads, setThreads] = useState<Record<string, Message[]>>(INITIAL_THREADS);
  const [draft, setDraft] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  const active = CONTACTS.find((c) => c.id === activeId)!;
  const messages = threads[activeId] ?? [];

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return CONTACTS;
    return CONTACTS.filter((c) => c.name.toLowerCase().includes(q));
  }, [filter]);

  const groups  = filtered.filter((c) => c.kind === "group");
  const dms     = filtered.filter((c) => c.kind === "dm");

  // Auto-scroll to the latest message when the thread changes or grows.
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
      [activeId]: [
        ...(prev[activeId] ?? []),
        { id: Date.now(), from: "me", text: t, time: nowHHMM() },
      ],
    }));
    setDraft("");
  }

  return (
    <div className="bg-background flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="border-border flex w-72 shrink-0 flex-col border-r">
        <header className="border-border border-b px-3 py-3">
          <h1 className="text-base font-semibold tracking-tight">Messages</h1>
          <div className="relative mt-2">
            <Search className="text-muted-foreground absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search…"
              className="pl-8"
              aria-label="Filter contacts"
            />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title="Groups" items={groups} activeId={activeId} onSelect={setActiveId} />
          <Section title="Direct messages" items={dms} activeId={activeId} onSelect={setActiveId} />
          {filtered.length === 0 ? (
            <p className="text-muted-foreground px-4 py-6 text-xs">No matches.</p>
          ) : null}
        </div>
      </aside>

      {/* Conversation */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="border-border flex items-center gap-3 border-b px-4 py-3">
          <Avatar name={active.name} kind={active.kind} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{active.name}</p>
            <p className="text-muted-foreground text-xs">
              {active.kind === "group" ? "Group · 12 members" : "Active now"}
            </p>
          </div>
        </header>

        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {messages.map((m) => {
              const mine = m.from === "me";
              return (
                <div key={m.id} className={mine ? "flex justify-end" : "flex items-end gap-2"}>
                  {!mine ? <Avatar name={m.from} kind="dm" small /> : null}
                  <div className={"max-w-[75%] flex-col " + (mine ? "items-end" : "items-start")}>
                    {!mine ? (
                      <p className="text-muted-foreground mb-0.5 text-[11px]">{m.from}</p>
                    ) : null}
                    <div
                      className={
                        "rounded-2xl px-3 py-2 text-sm shadow-sm " +
                        (mine
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm")
                      }
                    >
                      {m.text}
                    </div>
                    <p className={"text-muted-foreground mt-0.5 text-[10px] " + (mine ? "text-right" : "")}>
                      {m.time}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Composer */}
        <form onSubmit={onSend} className="border-border border-t px-4 py-3">
          <div className="bg-muted/40 border-border focus-within:ring-ring/40 mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border p-2 focus-within:ring-2">
            <Button type="button" size="icon" variant="ghost" aria-label="Attach file" title="Attach file">
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" aria-label="Attach image" title="Attach image">
              <ImageIcon className="h-4 w-4" />
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
              placeholder={\`Message \${active.name}…\`}
              rows={1}
              className="placeholder:text-muted-foreground max-h-40 min-h-[2.25rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
              aria-label="Message"
            />
            <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Send message">
              <Send className="h-4 w-4" />
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
    <div className="px-2 py-3">
      <p className="text-muted-foreground px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider">{title}</p>
      <ul className="flex flex-col gap-0.5">
        {items.map((c) => {
          const isActive = c.id === activeId;
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className={
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors " +
                  (isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/60")
                }
              >
                <Avatar name={c.name} kind={c.kind} small />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{c.last}</p>
                </div>
                {c.unread > 0 ? (
                  <span className="bg-primary text-primary-foreground rounded-full px-1.5 py-0.5 text-[10px] font-medium">
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
  const size = small ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  const palette =
    kind === "group"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  return (
    <span className={\`inline-flex shrink-0 items-center justify-center rounded-full font-semibold \${size} \${palette}\`} aria-hidden>
      {initial(name)}
    </span>
  );
}

function nowHHMM() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
`,
      },
    ],
  },

  "plain-tailwind": {
    notes:
      "No shadcn — native elements + Tailwind utilities only. Place under src/ChatPage.jsx.",
    files: [
      {
        filename: "ChatPage.jsx",
        language: "jsx",
        code: `import { useEffect, useMemo, useRef, useState } from "react";

${DATA_JS}

export default function ChatPage() {
  const [activeId, setActiveId] = useState("dm-aeris");
  const [filter, setFilter] = useState("");
  const [threads, setThreads] = useState(INITIAL_THREADS);
  const [draft, setDraft] = useState("");
  const scrollerRef = useRef(null);

  const active = CONTACTS.find((c) => c.id === activeId);
  const messages = threads[activeId] ?? [];

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return CONTACTS;
    return CONTACTS.filter((c) => c.name.toLowerCase().includes(q));
  }, [filter]);
  const groups = filtered.filter((c) => c.kind === "group");
  const dms    = filtered.filter((c) => c.kind === "dm");

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeId]);

  function onSend(e) {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    setThreads((prev) => ({
      ...prev,
      [activeId]: [
        ...(prev[activeId] ?? []),
        { id: Date.now(), from: "me", text: t, time: nowHHMM() },
      ],
    }));
    setDraft("");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white text-gray-900">
      <aside className="flex w-72 shrink-0 flex-col border-r border-gray-200">
        <header className="border-b border-gray-200 px-3 py-3">
          <h1 className="text-base font-semibold tracking-tight">Messages</h1>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search…"
            className="mt-2 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            aria-label="Filter contacts"
          />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Section title="Groups" items={groups} activeId={activeId} onSelect={setActiveId} />
          <Section title="Direct messages" items={dms} activeId={activeId} onSelect={setActiveId} />
          {filtered.length === 0 ? <p className="px-4 py-6 text-xs text-gray-500">No matches.</p> : null}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
          <Avatar name={active.name} kind={active.kind} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{active.name}</p>
            <p className="text-xs text-gray-500">
              {active.kind === "group" ? "Group · 12 members" : "Active now"}
            </p>
          </div>
        </header>

        <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {messages.map((m) => {
              const mine = m.from === "me";
              return (
                <div key={m.id} className={mine ? "flex justify-end" : "flex items-end gap-2"}>
                  {!mine ? <Avatar name={m.from} kind="dm" small /> : null}
                  <div className={"flex max-w-[75%] flex-col " + (mine ? "items-end" : "items-start")}>
                    {!mine ? <p className="mb-0.5 text-[11px] text-gray-500">{m.from}</p> : null}
                    <div
                      className={
                        "rounded-2xl px-3 py-2 text-sm shadow-sm " +
                        (mine
                          ? "rounded-br-sm bg-indigo-600 text-white"
                          : "rounded-bl-sm bg-gray-100 text-gray-900")
                      }
                    >
                      {m.text}
                    </div>
                    <p className={"mt-0.5 text-[10px] text-gray-500 " + (mine ? "text-right" : "")}>{m.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <form onSubmit={onSend} className="border-t border-gray-200 px-4 py-3">
          <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-2 focus-within:ring-2 focus-within:ring-gray-200">
            <button type="button" aria-label="Attach file" title="Attach file" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900">
              📎
            </button>
            <button type="button" aria-label="Attach image" title="Attach image" className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200 hover:text-gray-900">
              🖼️
            </button>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend(e);
                }
              }}
              placeholder={\`Message \${active.name}…\`}
              rows={1}
              className="max-h-40 min-h-[2.25rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-gray-400"
              aria-label="Message"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send message"
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Section({ title, items, activeId, onSelect }) {
  if (items.length === 0) return null;
  return (
    <div className="px-2 py-3">
      <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">{title}</p>
      <ul className="flex flex-col gap-0.5">
        {items.map((c) => {
          const isActive = c.id === activeId;
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className={
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors " +
                  (isActive ? "bg-gray-100" : "hover:bg-gray-50")
                }
              >
                <Avatar name={c.name} kind={c.kind} small />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-xs text-gray-500">{c.last}</p>
                </div>
                {c.unread > 0 ? (
                  <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
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

function Avatar({ name, kind, small }) {
  const size = small ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  const palette = kind === "group" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700";
  return (
    <span className={\`inline-flex shrink-0 items-center justify-center rounded-full font-semibold \${size} \${palette}\`} aria-hidden>
      {initial(name)}
    </span>
  );
}

function nowHHMM() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
`,
      },
    ],
  },

  "plain-css": {
    notes: "Two files. Place ChatPage.jsx and ChatPage.css side-by-side.",
    files: [
      {
        filename: "ChatPage.jsx",
        language: "jsx",
        code: `import { useEffect, useMemo, useRef, useState } from "react";
import "./ChatPage.css";

${DATA_JS}

export default function ChatPage() {
  const [activeId, setActiveId] = useState("dm-aeris");
  const [filter, setFilter] = useState("");
  const [threads, setThreads] = useState(INITIAL_THREADS);
  const [draft, setDraft] = useState("");
  const scrollerRef = useRef(null);

  const active = CONTACTS.find((c) => c.id === activeId);
  const messages = threads[activeId] ?? [];

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return CONTACTS;
    return CONTACTS.filter((c) => c.name.toLowerCase().includes(q));
  }, [filter]);
  const groups = filtered.filter((c) => c.kind === "group");
  const dms    = filtered.filter((c) => c.kind === "dm");

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, activeId]);

  function onSend(e) {
    e.preventDefault();
    const t = draft.trim();
    if (!t) return;
    setThreads((prev) => ({
      ...prev,
      [activeId]: [
        ...(prev[activeId] ?? []),
        { id: Date.now(), from: "me", text: t, time: nowHHMM() },
      ],
    }));
    setDraft("");
  }

  return (
    <div className="chat">
      <aside className="chat__side">
        <header className="chat__sideHeader">
          <h1 className="chat__sideTitle">Messages</h1>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search…"
            className="chat__filter"
            aria-label="Filter contacts"
          />
        </header>
        <div className="chat__sideList">
          <Section title="Groups" items={groups} activeId={activeId} onSelect={setActiveId} />
          <Section title="Direct messages" items={dms} activeId={activeId} onSelect={setActiveId} />
          {filtered.length === 0 ? <p className="chat__empty">No matches.</p> : null}
        </div>
      </aside>

      <main className="chat__main">
        <header className="chat__topbar">
          <Avatar name={active.name} kind={active.kind} />
          <div className="chat__topMain">
            <p className="chat__topName">{active.name}</p>
            <p className="chat__topSub">{active.kind === "group" ? "Group · 12 members" : "Active now"}</p>
          </div>
        </header>

        <div ref={scrollerRef} className="chat__scroll">
          <div className="chat__messages">
            {messages.map((m) => {
              const mine = m.from === "me";
              return (
                <div key={m.id} className={mine ? "chat__row chat__row--mine" : "chat__row"}>
                  {!mine ? <Avatar name={m.from} kind="dm" small /> : null}
                  <div className={mine ? "chat__bubbleWrap chat__bubbleWrap--mine" : "chat__bubbleWrap"}>
                    {!mine ? <p className="chat__from">{m.from}</p> : null}
                    <div className={mine ? "chat__bubble chat__bubble--mine" : "chat__bubble"}>{m.text}</div>
                    <p className={mine ? "chat__time chat__time--mine" : "chat__time"}>{m.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <form onSubmit={onSend} className="chat__composerWrap">
          <div className="chat__composer">
            <button type="button" className="chat__iconBtn" aria-label="Attach file" title="Attach file">📎</button>
            <button type="button" className="chat__iconBtn" aria-label="Attach image" title="Attach image">🖼️</button>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend(e);
                }
              }}
              placeholder={\`Message \${active.name}…\`}
              rows={1}
              className="chat__textarea"
              aria-label="Message"
            />
            <button type="submit" disabled={!draft.trim()} className="chat__send" aria-label="Send message">
              Send
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Section({ title, items, activeId, onSelect }) {
  if (items.length === 0) return null;
  return (
    <div className="chat__section">
      <p className="chat__sectionTitle">{title}</p>
      <ul className="chat__contacts">
        {items.map((c) => {
          const isActive = c.id === activeId;
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className={isActive ? "chat__contact chat__contact--active" : "chat__contact"}
              >
                <Avatar name={c.name} kind={c.kind} small />
                <div className="chat__contactMain">
                  <p className="chat__contactName">{c.name}</p>
                  <p className="chat__contactLast">{c.last}</p>
                </div>
                {c.unread > 0 ? <span className="chat__badge">{c.unread}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Avatar({ name, kind, small }) {
  const cls = "chat__avatar " + (small ? "chat__avatar--sm " : "") + (kind === "group" ? "chat__avatar--group" : "chat__avatar--dm");
  return <span className={cls} aria-hidden>{initial(name)}</span>;
}

function nowHHMM() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
`,
      },
      {
        filename: "ChatPage.css",
        language: "css",
        code: `.chat {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: #ffffff;
  color: #111827;
}
.chat__side {
  display: flex;
  flex-direction: column;
  width: 18rem;
  flex-shrink: 0;
  border-right: 1px solid #e5e7eb;
}
.chat__sideHeader { border-bottom: 1px solid #e5e7eb; padding: 0.75rem; }
.chat__sideTitle { font-size: 1rem; font-weight: 600; margin: 0; letter-spacing: -0.01em; }
.chat__filter {
  margin-top: 0.5rem;
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  outline: none;
  background: #ffffff;
}
.chat__filter:focus { border-color: #6b7280; box-shadow: 0 0 0 2px #e5e7eb; }
.chat__sideList { min-height: 0; flex: 1; overflow-y: auto; }
.chat__empty { padding: 1.5rem 1rem; font-size: 0.75rem; color: #6b7280; }

.chat__section { padding: 0.75rem 0.5rem; }
.chat__sectionTitle {
  padding: 0 0.5rem 0.25rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
  margin: 0;
}
.chat__contacts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.125rem; }
.chat__contact {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.5rem;
  border: 0;
  background: transparent;
  border-radius: 0.375rem;
  padding: 0.5rem;
  text-align: left;
  cursor: pointer;
  color: inherit;
}
.chat__contact:hover { background: #f9fafb; }
.chat__contact--active { background: #f3f4f6; }
.chat__contactMain { min-width: 0; flex: 1; }
.chat__contactName {
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat__contactLast {
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat__badge {
  background: #4f46e5;
  color: #ffffff;
  border-radius: 9999px;
  padding: 0.125rem 0.375rem;
  font-size: 0.625rem;
  font-weight: 500;
}

.chat__main { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.chat__topbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-bottom: 1px solid #e5e7eb;
  padding: 0.75rem 1rem;
}
.chat__topMain { min-width: 0; flex: 1; }
.chat__topName {
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat__topSub { font-size: 0.75rem; color: #6b7280; margin: 0; }

.chat__scroll {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}
.chat__scroll::-webkit-scrollbar { width: 8px; }
.chat__scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 4px; }
.chat__scroll::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
.chat__messages {
  max-width: 48rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.chat__row {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
}
.chat__row--mine { justify-content: flex-end; }
.chat__bubbleWrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 75%;
}
.chat__bubbleWrap--mine { align-items: flex-end; }
.chat__from { font-size: 0.6875rem; color: #6b7280; margin: 0 0 0.125rem; }
.chat__bubble {
  border-radius: 1rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  background: #f3f4f6;
  color: #111827;
  border-bottom-left-radius: 0.25rem;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  word-wrap: break-word;
}
.chat__bubble--mine {
  background: #4f46e5;
  color: #ffffff;
  border-bottom-left-radius: 1rem;
  border-bottom-right-radius: 0.25rem;
}
.chat__time { font-size: 0.625rem; color: #6b7280; margin: 0.125rem 0 0; }
.chat__time--mine { text-align: right; }

.chat__composerWrap { border-top: 1px solid #e5e7eb; padding: 0.75rem 1rem; }
.chat__composer {
  max-width: 48rem;
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  border-radius: 1rem;
  padding: 0.5rem;
}
.chat__composer:focus-within { box-shadow: 0 0 0 2px #e5e7eb; }
.chat__iconBtn {
  border: 0;
  background: transparent;
  color: #6b7280;
  border-radius: 0.375rem;
  padding: 0.375rem;
  cursor: pointer;
  font-size: 1rem;
}
.chat__iconBtn:hover { background: #e5e7eb; color: #111827; }
.chat__textarea {
  flex: 1;
  resize: none;
  background: transparent;
  border: 0;
  outline: none;
  padding: 0.375rem 0.5rem;
  font-size: 0.875rem;
  min-height: 2.25rem;
  max-height: 10rem;
  font-family: inherit;
}
.chat__send {
  background: #4f46e5;
  color: #ffffff;
  border: 0;
  border-radius: 0.375rem;
  padding: 0.375rem 0.875rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}
.chat__send:hover:not(:disabled) { background: #4338ca; }
.chat__send:disabled { opacity: 0.5; cursor: not-allowed; }

.chat__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  flex-shrink: 0;
}
.chat__avatar--sm { width: 1.75rem; height: 1.75rem; font-size: 0.625rem; }
.chat__avatar--group { background: #d1fae5; color: #047857; }
.chat__avatar--dm    { background: #e0f2fe; color: #0369a1; }
`,
      },
    ],
  },

  "shadcn-css": {
    notes:
      "Unusual combo: shadcn primitives for controls, layout via a colocated CSS file (NO Tailwind utilities).\nInstall: npx shadcn@latest add input button card\nPlace ChatPage.tsx and ChatPage.css together.",
    files: [
      {
        filename: "ChatPage.tsx",
        language: "tsx",
        code: `import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import "./ChatPage.css";

${DATA}

export default function ChatPage() {
  const [activeId, setActiveId] = useState<string>("dm-aeris");
  const [filter, setFilter] = useState("");
  const [threads, setThreads] = useState<Record<string, Message[]>>(INITIAL_THREADS);
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
  const dms    = filtered.filter((c) => c.kind === "dm");

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
      [activeId]: [
        ...(prev[activeId] ?? []),
        { id: Date.now(), from: "me", text: t, time: nowHHMM() },
      ],
    }));
    setDraft("");
  }

  return (
    <div className="chat">
      <aside className="chat__side">
        <header className="chat__sideHeader">
          <h1 className="chat__sideTitle">Messages</h1>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search…"
            aria-label="Filter contacts"
          />
        </header>
        <div className="chat__sideList">
          <Section title="Groups" items={groups} activeId={activeId} onSelect={setActiveId} />
          <Section title="Direct messages" items={dms} activeId={activeId} onSelect={setActiveId} />
          {filtered.length === 0 ? <p className="chat__empty">No matches.</p> : null}
        </div>
      </aside>

      <main className="chat__main">
        <header className="chat__topbar">
          <Avatar name={active.name} kind={active.kind} />
          <div className="chat__topMain">
            <p className="chat__topName">{active.name}</p>
            <p className="chat__topSub">{active.kind === "group" ? "Group · 12 members" : "Active now"}</p>
          </div>
        </header>

        <div ref={scrollerRef} className="chat__scroll">
          <div className="chat__messages">
            {messages.map((m) => {
              const mine = m.from === "me";
              return (
                <div key={m.id} className={mine ? "chat__row chat__row--mine" : "chat__row"}>
                  {!mine ? <Avatar name={m.from} kind="dm" small /> : null}
                  <div className={mine ? "chat__bubbleWrap chat__bubbleWrap--mine" : "chat__bubbleWrap"}>
                    {!mine ? <p className="chat__from">{m.from}</p> : null}
                    <div className={mine ? "chat__bubble chat__bubble--mine" : "chat__bubble"}>{m.text}</div>
                    <p className={mine ? "chat__time chat__time--mine" : "chat__time"}>{m.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <form onSubmit={onSend} className="chat__composerWrap">
          <div className="chat__composer">
            <Button type="button" size="icon" variant="ghost" aria-label="Attach file" title="Attach file">📎</Button>
            <Button type="button" size="icon" variant="ghost" aria-label="Attach image" title="Attach image">🖼️</Button>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend(e);
                }
              }}
              placeholder={\`Message \${active.name}…\`}
              rows={1}
              className="chat__textarea"
              aria-label="Message"
            />
            <Button type="submit" disabled={!draft.trim()} aria-label="Send message">Send</Button>
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
    <div className="chat__section">
      <p className="chat__sectionTitle">{title}</p>
      <ul className="chat__contacts">
        {items.map((c) => {
          const isActive = c.id === activeId;
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className={isActive ? "chat__contact chat__contact--active" : "chat__contact"}
              >
                <Avatar name={c.name} kind={c.kind} small />
                <div className="chat__contactMain">
                  <p className="chat__contactName">{c.name}</p>
                  <p className="chat__contactLast">{c.last}</p>
                </div>
                {c.unread > 0 ? <span className="chat__badge">{c.unread}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Avatar({ name, kind, small }: { name: string; kind: "group" | "dm"; small?: boolean }) {
  const cls = "chat__avatar " + (small ? "chat__avatar--sm " : "") + (kind === "group" ? "chat__avatar--group" : "chat__avatar--dm");
  return <span className={cls} aria-hidden>{initial(name)}</span>;
}

function nowHHMM() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
`,
      },
      {
        filename: "ChatPage.css",
        language: "css",
        code: `.chat {
  display: flex;
  height: 100vh;
  overflow: hidden;
}
.chat__side {
  display: flex;
  flex-direction: column;
  width: 18rem;
  flex-shrink: 0;
  border-right: 1px solid hsl(var(--border));
}
.chat__sideHeader {
  border-bottom: 1px solid hsl(var(--border));
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.chat__sideTitle {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
}
.chat__sideList { min-height: 0; flex: 1; overflow-y: auto; }
.chat__empty {
  padding: 1.5rem 1rem;
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
}

.chat__section { padding: 0.75rem 0.5rem; }
.chat__sectionTitle {
  padding: 0 0.5rem 0.25rem;
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: hsl(var(--muted-foreground));
  margin: 0;
}
.chat__contacts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.125rem; }
.chat__contact {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.5rem;
  border: 0;
  background: transparent;
  border-radius: 0.375rem;
  padding: 0.5rem;
  text-align: left;
  cursor: pointer;
  color: inherit;
}
.chat__contact:hover { background: hsl(var(--accent) / 0.6); }
.chat__contact--active { background: hsl(var(--accent)); color: hsl(var(--accent-foreground)); }
.chat__contactMain { min-width: 0; flex: 1; }
.chat__contactName {
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat__contactLast {
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat__badge {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border-radius: 9999px;
  padding: 0.125rem 0.375rem;
  font-size: 0.625rem;
  font-weight: 500;
}

.chat__main { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.chat__topbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-bottom: 1px solid hsl(var(--border));
  padding: 0.75rem 1rem;
}
.chat__topMain { min-width: 0; flex: 1; }
.chat__topName {
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat__topSub { font-size: 0.75rem; color: hsl(var(--muted-foreground)); margin: 0; }

.chat__scroll { min-height: 0; flex: 1; overflow-y: auto; padding: 1rem; }
.chat__scroll::-webkit-scrollbar { width: 8px; }
.chat__scroll::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 4px;
}
.chat__messages {
  max-width: 48rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.chat__row {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
}
.chat__row--mine { justify-content: flex-end; }
.chat__bubbleWrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 75%;
}
.chat__bubbleWrap--mine { align-items: flex-end; }
.chat__from {
  font-size: 0.6875rem;
  color: hsl(var(--muted-foreground));
  margin: 0 0 0.125rem;
}
.chat__bubble {
  border-radius: 1rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
  border-bottom-left-radius: 0.25rem;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  word-wrap: break-word;
}
.chat__bubble--mine {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border-bottom-left-radius: 1rem;
  border-bottom-right-radius: 0.25rem;
}
.chat__time {
  font-size: 0.625rem;
  color: hsl(var(--muted-foreground));
  margin: 0.125rem 0 0;
}
.chat__time--mine { text-align: right; }

.chat__composerWrap { border-top: 1px solid hsl(var(--border)); padding: 0.75rem 1rem; }
.chat__composer {
  max-width: 48rem;
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--muted) / 0.4);
  border-radius: 1rem;
  padding: 0.5rem;
}
.chat__textarea {
  flex: 1;
  resize: none;
  background: transparent;
  border: 0;
  outline: none;
  padding: 0.375rem 0.5rem;
  font-size: 0.875rem;
  min-height: 2.25rem;
  max-height: 10rem;
  font-family: inherit;
  color: inherit;
}

.chat__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  flex-shrink: 0;
}
.chat__avatar--sm { width: 1.75rem; height: 1.75rem; font-size: 0.625rem; }
.chat__avatar--group { background: #d1fae5; color: #047857; }
.chat__avatar--dm    { background: #e0f2fe; color: #0369a1; }
`,
      },
    ],
  },
};
