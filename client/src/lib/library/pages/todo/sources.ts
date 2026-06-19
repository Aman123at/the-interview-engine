import type { ReactVariantSources } from "../../types";

const PAGE_CONST = `const PAGE_SIZE = 5;`;

export const sources: ReactVariantSources = {
  "shadcn-tailwind": {
    notes:
      "Install shadcn primitives:\n  npx shadcn@latest add input button card checkbox\nPlace under src/TodoPage.tsx in your React app. The 3D tilt uses Tailwind's `motion-safe:` variant so it auto-disables under prefers-reduced-motion.",
    files: [
      {
        filename: "TodoPage.tsx",
        language: "tsx",
        code: `import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";

${PAGE_CONST}

interface Todo {
  id: number;
  title: string;
  note: string;
  done: boolean;
}

export default function TodoPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(todos.length / PAGE_SIZE));
  const visible = todos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Clamp page if the list shrinks under it (e.g. after deletes).
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setTodos((prev) => [
      { id: Date.now(), title: t, note: note.trim(), done: false },
      ...prev,
    ]);
    setTitle("");
    setNote("");
    setOpen(false);
    setPage(1);
  }

  function onToggle(id: number) {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  }

  function onDelete(id: number) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6 [perspective:1000px]">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Todos</h1>
        <Button onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "Add Todo"}
        </Button>
      </header>

      {open && (
        <form
          onSubmit={onAdd}
          className="bg-card flex flex-col gap-2 rounded-lg border p-4 shadow-sm"
        >
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            autoFocus
            aria-label="Title"
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            aria-label="Note"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add</Button>
          </div>
        </form>
      )}

      {todos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="text-sm font-medium">No todos yet</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Click "Add Todo" to create one.
          </p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {visible.map((t) => (
              <li key={t.id}>
                <Card
                  className={
                    "flex items-center gap-3 border-2 p-4 transition-transform duration-200 will-change-transform " +
                    "motion-safe:hover:-translate-y-1 motion-safe:hover:[transform:translateY(-4px)_rotateX(4deg)_rotateY(-3deg)] " +
                    "motion-safe:hover:shadow-xl"
                  }
                >
                  <Checkbox
                    checked={t.done}
                    onCheckedChange={() => onToggle(t.id)}
                    aria-label={"Toggle " + t.title}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        "text-sm font-medium " +
                        (t.done ? "text-muted-foreground line-through" : "")
                      }
                    >
                      {t.title}
                    </p>
                    {t.note ? (
                      <p
                        className={
                          "text-xs " +
                          (t.done
                            ? "text-muted-foreground/70 line-through"
                            : "text-muted-foreground")
                        }
                      >
                        {t.note}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDelete(t.id)}
                    aria-label={"Delete " + t.title}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Card>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Page {page} of {totalPages} · {todos.length} todo{todos.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Prev
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
`,
      },
    ],
  },

  "plain-tailwind": {
    notes:
      "No shadcn — native elements + Tailwind utilities only. Place under src/TodoPage.jsx. The 3D tilt uses Tailwind's `motion-safe:` variant so it auto-disables under prefers-reduced-motion.",
    files: [
      {
        filename: "TodoPage.jsx",
        language: "jsx",
        code: `import { useEffect, useState } from "react";

${PAGE_CONST}

export default function TodoPage() {
  const [todos, setTodos] = useState([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(todos.length / PAGE_SIZE));
  const visible = todos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function onAdd(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setTodos((prev) => [
      { id: Date.now(), title: t, note: note.trim(), done: false },
      ...prev,
    ]);
    setTitle("");
    setNote("");
    setOpen(false);
    setPage(1);
  }

  function onToggle(id) {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  }

  function onDelete(id) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6 [perspective:1000px] text-gray-900">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Todos</h1>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          {open ? "Cancel" : "Add Todo"}
        </button>
      </header>

      {open && (
        <form
          onSubmit={onAdd}
          className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            autoFocus
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            aria-label="Title"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-200"
            aria-label="Note"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Add
            </button>
          </div>
        </form>
      )}

      {todos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
          <p className="text-sm font-medium">No todos yet</p>
          <p className="mt-1 text-xs text-gray-500">
            Click "Add Todo" to create one.
          </p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {visible.map((t) => (
              <li key={t.id}>
                <div
                  className={
                    "flex items-center gap-3 rounded-lg border-2 border-gray-200 bg-white p-4 shadow-sm " +
                    "transition-transform duration-200 will-change-transform " +
                    "motion-safe:hover:[transform:translateY(-4px)_rotateX(4deg)_rotateY(-3deg)] motion-safe:hover:shadow-xl"
                  }
                >
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => onToggle(t.id)}
                    className="h-4 w-4 rounded border-gray-300"
                    aria-label={"Toggle " + t.title}
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        "text-sm font-medium " +
                        (t.done ? "text-gray-400 line-through" : "")
                      }
                    >
                      {t.title}
                    </p>
                    {t.note ? (
                      <p
                        className={
                          "text-xs " +
                          (t.done ? "text-gray-300 line-through" : "text-gray-500")
                        }
                      >
                        {t.note}
                      </p>
                    ) : null}
                  </div>
                  <button
                    onClick={() => onDelete(t.id)}
                    aria-label={"Delete " + t.title}
                    className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">
              Page {page} of {totalPages} · {todos.length} todo{todos.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
`,
      },
    ],
  },

  "plain-css": {
    notes:
      "Two files. Place TodoPage.jsx and TodoPage.css side-by-side. The .card-3d perspective/transform rules disable under @media (prefers-reduced-motion: reduce).",
    files: [
      {
        filename: "TodoPage.jsx",
        language: "jsx",
        code: `import { useEffect, useState } from "react";
import "./TodoPage.css";

${PAGE_CONST}

export default function TodoPage() {
  const [todos, setTodos] = useState([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(todos.length / PAGE_SIZE));
  const visible = todos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function onAdd(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setTodos((prev) => [
      { id: Date.now(), title: t, note: note.trim(), done: false },
      ...prev,
    ]);
    setTitle("");
    setNote("");
    setOpen(false);
    setPage(1);
  }

  function onToggle(id) {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  }

  function onDelete(id) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="todo">
      <header className="todo__header">
        <h1 className="todo__heading">Todos</h1>
        <button className="todo__add" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "Add Todo"}
        </button>
      </header>

      {open && (
        <form className="todo__form" onSubmit={onAdd}>
          <input
            className="todo__input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            autoFocus
            aria-label="Title"
          />
          <input
            className="todo__input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            aria-label="Note"
          />
          <div className="todo__actions">
            <button
              type="button"
              className="todo__btn"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button type="submit" className="todo__add">Add</button>
          </div>
        </form>
      )}

      {todos.length === 0 ? (
        <div className="todo__empty">
          <p className="todo__emptyTitle">No todos yet</p>
          <p className="todo__emptySub">Click "Add Todo" to create one.</p>
        </div>
      ) : (
        <>
          <ul className="todo__list">
            {visible.map((t) => (
              <li key={t.id} className="todo__perspective">
                <div className={"card-3d" + (t.done ? " card-3d--done" : "")}>
                  <input
                    type="checkbox"
                    className="todo__check"
                    checked={t.done}
                    onChange={() => onToggle(t.id)}
                    aria-label={"Toggle " + t.title}
                  />
                  <div className="todo__rowMain">
                    <p className={"todo__title" + (t.done ? " todo__title--done" : "")}>
                      {t.title}
                    </p>
                    {t.note ? (
                      <p className={"todo__note" + (t.done ? " todo__note--done" : "")}>
                        {t.note}
                      </p>
                    ) : null}
                  </div>
                  <button
                    className="todo__delete"
                    onClick={() => onDelete(t.id)}
                    aria-label={"Delete " + t.title}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="todo__pager">
            <span className="todo__pageInfo">
              Page {page} of {totalPages} · {todos.length} todo{todos.length === 1 ? "" : "s"}
            </span>
            <div className="todo__pagerBtns">
              <button
                className="todo__pageBtn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <button
                className="todo__pageBtn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
`,
      },
      {
        filename: "TodoPage.css",
        language: "css",
        code: `.todo {
  max-width: 42rem;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  color: #111827;
}
.todo__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.todo__heading {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
}
.todo__add {
  background: #111827;
  color: #ffffff;
  border: 0;
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}
.todo__add:hover { background: #1f2937; }
.todo__btn {
  background: #ffffff;
  color: #111827;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}
.todo__btn:hover { background: #f9fafb; }
.todo__form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 0.5rem;
  padding: 1rem;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}
.todo__input {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  outline: none;
}
.todo__input:focus {
  border-color: #6b7280;
  box-shadow: 0 0 0 2px #e5e7eb;
}
.todo__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
.todo__empty {
  border: 1px dashed #d1d5db;
  border-radius: 0.5rem;
  padding: 2.5rem;
  text-align: center;
}
.todo__emptyTitle { font-size: 0.875rem; font-weight: 500; margin: 0; }
.todo__emptySub  { font-size: 0.75rem; color: #6b7280; margin: 0.25rem 0 0; }
.todo__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* The 3D card. Each row sits inside a per-row perspective so the tilt
   feels local, not page-wide. transform-only animation = GPU-friendly. */
.todo__perspective {
  perspective: 1000px;
}
.card-3d {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border: 2px solid #e5e7eb;
  background: #ffffff;
  border-radius: 0.5rem;
  padding: 1rem;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  transform-style: preserve-3d;
  transition: transform 200ms ease, box-shadow 200ms ease;
  will-change: transform;
}
.card-3d:hover {
  transform: translateY(-4px) rotateX(4deg) rotateY(-3deg);
  box-shadow: 0 18px 30px -12px rgba(0,0,0,0.25);
}
@media (prefers-reduced-motion: reduce) {
  .card-3d, .card-3d:hover {
    transform: none;
    transition: none;
  }
}
.card-3d--done { background: #fafafa; }

.todo__check { width: 1rem; height: 1rem; }
.todo__rowMain { min-width: 0; flex: 1; }
.todo__title {
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0;
}
.todo__title--done {
  text-decoration: line-through;
  color: #9ca3af;
}
.todo__note {
  font-size: 0.75rem;
  color: #6b7280;
  margin: 0.125rem 0 0;
}
.todo__note--done {
  text-decoration: line-through;
  color: #d1d5db;
}
.todo__delete {
  background: transparent;
  color: #6b7280;
  border: 0;
  border-radius: 0.375rem;
  padding: 0.375rem 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
}
.todo__delete:hover { background: #f3f4f6; color: #111827; }

.todo__pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.875rem;
}
.todo__pageInfo { color: #6b7280; }
.todo__pagerBtns { display: flex; align-items: center; gap: 0.5rem; }
.todo__pageBtn {
  border: 1px solid #d1d5db;
  background: #ffffff;
  border-radius: 0.375rem;
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
}
.todo__pageBtn:hover:not(:disabled) { background: #f9fafb; }
.todo__pageBtn:disabled { opacity: 0.5; cursor: not-allowed; }
`,
      },
    ],
  },

  "shadcn-css": {
    notes:
      "Unusual combo: shadcn primitives for controls, layout + 3D card via a colocated CSS file (NO Tailwind utilities).\nInstall: npx shadcn@latest add input button card checkbox\nPlace TodoPage.tsx and TodoPage.css together.",
    files: [
      {
        filename: "TodoPage.tsx",
        language: "tsx",
        code: `import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import "./TodoPage.css";

${PAGE_CONST}

interface Todo {
  id: number;
  title: string;
  note: string;
  done: boolean;
}

export default function TodoPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(todos.length / PAGE_SIZE));
  const visible = todos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setTodos((prev) => [
      { id: Date.now(), title: t, note: note.trim(), done: false },
      ...prev,
    ]);
    setTitle("");
    setNote("");
    setOpen(false);
    setPage(1);
  }

  function onToggle(id: number) {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  }

  function onDelete(id: number) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="todo">
      <header className="todo__header">
        <h1 className="todo__heading">Todos</h1>
        <Button onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "Add Todo"}
        </Button>
      </header>

      {open && (
        <form className="todo__form" onSubmit={onAdd}>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            autoFocus
            aria-label="Title"
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            aria-label="Note"
          />
          <div className="todo__actions">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add</Button>
          </div>
        </form>
      )}

      {todos.length === 0 ? (
        <div className="todo__empty">
          <p className="todo__emptyTitle">No todos yet</p>
          <p className="todo__emptySub">Click "Add Todo" to create one.</p>
        </div>
      ) : (
        <>
          <ul className="todo__list">
            {visible.map((t) => (
              <li key={t.id} className="todo__perspective">
                <Card className={"card-3d" + (t.done ? " card-3d--done" : "")}>
                  <Checkbox
                    checked={t.done}
                    onCheckedChange={() => onToggle(t.id)}
                    aria-label={"Toggle " + t.title}
                  />
                  <div className="todo__rowMain">
                    <p className={"todo__title" + (t.done ? " todo__title--done" : "")}>
                      {t.title}
                    </p>
                    {t.note ? (
                      <p className={"todo__note" + (t.done ? " todo__note--done" : "")}>
                        {t.note}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onDelete(t.id)}
                    aria-label={"Delete " + t.title}
                  >
                    ✕
                  </Button>
                </Card>
              </li>
            ))}
          </ul>

          <div className="todo__pager">
            <span className="todo__pageInfo">
              Page {page} of {totalPages} · {todos.length} todo{todos.length === 1 ? "" : "s"}
            </span>
            <div className="todo__pagerBtns">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Prev
              </Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
`,
      },
      {
        filename: "TodoPage.css",
        language: "css",
        code: `.todo {
  max-width: 42rem;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.todo__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.todo__heading {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 0;
}
.todo__form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
}
.todo__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
.todo__empty {
  border: 1px dashed hsl(var(--border));
  border-radius: 0.5rem;
  padding: 2.5rem;
  text-align: center;
}
.todo__emptyTitle { font-size: 0.875rem; font-weight: 500; margin: 0; }
.todo__emptySub  {
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
  margin: 0.25rem 0 0;
}
.todo__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* The 3D card. Per-row perspective; transform-only animation. */
.todo__perspective {
  perspective: 1000px;
}
.card-3d {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-width: 2px;
  padding: 1rem;
  transform-style: preserve-3d;
  transition: transform 200ms ease, box-shadow 200ms ease;
  will-change: transform;
}
.card-3d:hover {
  transform: translateY(-4px) rotateX(4deg) rotateY(-3deg);
  box-shadow: 0 18px 30px -12px rgba(0, 0, 0, 0.25);
}
@media (prefers-reduced-motion: reduce) {
  .card-3d, .card-3d:hover {
    transform: none;
    transition: none;
  }
}
.card-3d--done {
  background: hsl(var(--muted));
}

.todo__rowMain { min-width: 0; flex: 1; }
.todo__title {
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0;
}
.todo__title--done {
  text-decoration: line-through;
  color: hsl(var(--muted-foreground));
}
.todo__note {
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
  margin: 0.125rem 0 0;
}
.todo__note--done {
  text-decoration: line-through;
  opacity: 0.6;
}

.todo__pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.875rem;
}
.todo__pageInfo { color: hsl(var(--muted-foreground)); }
.todo__pagerBtns { display: flex; align-items: center; gap: 0.5rem; }
`,
      },
    ],
  },
};
