"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";

interface Todo {
  id: number;
  title: string;
  note: string;
  done: boolean;
}

const PAGE_SIZE = 3;

export default function TodoPreview() {
  const [todos, setTodos] = useState<Todo[]>([
    { id: 1, title: "Try the 3D tilt — hover me", note: "Hover lifts + rotates", done: false },
    { id: 2, title: "Toggle me to see line-through", note: "", done: true },
    { id: 3, title: "Add more todos to test pagination", note: "Page size is 3", done: false },
    { id: 4, title: "This one lives on page 2", note: "Click Next →", done: false },
  ]);
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
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 [perspective:1000px]">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Todos</h2>
        <Button size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "Add Todo"}
        </Button>
      </header>

      {open && (
        <form
          onSubmit={onAdd}
          className="bg-card flex flex-col gap-2 rounded-lg border p-3 shadow-sm"
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
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">Add</Button>
          </div>
        </form>
      )}

      {todos.length === 0 ? (
        <div className="border-border rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">No todos yet</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Click &ldquo;Add Todo&rdquo; to create one.
          </p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {visible.map((t) => (
              <li key={t.id}>
                <Card
                  className={
                    "flex flex-row items-center gap-3 border-2 p-3 transition-transform duration-200 will-change-transform " +
                    "motion-safe:hover:[transform:translateY(-4px)_rotateX(4deg)_rotateY(-3deg)] motion-safe:hover:shadow-xl"
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

          <div className="flex items-center justify-between text-xs">
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
