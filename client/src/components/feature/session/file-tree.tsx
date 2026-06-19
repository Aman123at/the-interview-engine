"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  ChevronRight,
  FilePlus,
  FolderPlus,
  Folder,
  FolderOpen,
  FileCode,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { sortTree } from "@/lib/fs-tree";
import type { FileNode } from "@/types/session";

export interface FileTreeProps {
  root: FileNode[] | null;
  loading?: boolean;
  /** Path currently open in the editor; highlighted in the tree. */
  activePath?: string | null;
  /** Read-only mode — hides all create/rename/delete affordances. */
  readOnly?: boolean;
  onOpenFile: (path: string) => void;
  onCreate: (parentPath: string, name: string, kind: FileNode["kind"]) => void;
  onRename: (path: string, newName: string) => void;
  onDelete: (path: string) => void;
}

interface PendingCreate {
  parentPath: string;
  kind: FileNode["kind"];
}

export function FileTree({
  root,
  loading,
  activePath,
  readOnly = false,
  onOpenFile,
  onCreate,
  onRename,
  onDelete,
}: FileTreeProps) {
  const sorted = useMemo(() => (root ? sortTree(root) : []), [root]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(
    null,
  );

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-1.5 px-2 py-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-border/60 flex items-center justify-between border-b px-2 py-1.5">
        <p className="text-muted-foreground font-mono text-[10px] uppercase tracking-wider">
          Files
        </p>
        {!readOnly ? (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="New file at root"
              onClick={() => setPendingCreate({ parentPath: "/", kind: "file" })}
            >
              <FilePlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="New folder at root"
              onClick={() =>
                setPendingCreate({ parentPath: "/", kind: "directory" })
              }
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>

      <div
        className="flex-1 overflow-auto py-1"
        role="tree"
        aria-label="Workspace files"
      >
        <TreeNodes
          nodes={sorted}
          depth={0}
          expanded={expanded}
          activePath={activePath}
          readOnly={readOnly}
          renaming={renaming}
          pendingCreate={pendingCreate}
          onToggle={toggle}
          onOpenFile={onOpenFile}
          onStartRename={(p) => setRenaming(p)}
          onCancelRename={() => setRenaming(null)}
          onCommitRename={(p, name) => {
            setRenaming(null);
            onRename(p, name);
          }}
          onStartCreate={(parentPath, kind) => {
            setExpanded((prev) => new Set(prev).add(parentPath));
            setPendingCreate({ parentPath, kind });
          }}
          onCancelCreate={() => setPendingCreate(null)}
          onCommitCreate={(parentPath, name, kind) => {
            setPendingCreate(null);
            onCreate(parentPath, name, kind);
          }}
          onDelete={onDelete}
        />
        {pendingCreate?.parentPath === "/" ? (
          <NewNodeRow
            depth={0}
            kind={pendingCreate.kind}
            onCancel={() => setPendingCreate(null)}
            onCommit={(name) => {
              setPendingCreate(null);
              onCreate("/", name, pendingCreate.kind);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

interface TreeNodesProps {
  nodes: FileNode[];
  depth: number;
  expanded: Set<string>;
  activePath?: string | null;
  readOnly: boolean;
  renaming: string | null;
  pendingCreate: PendingCreate | null;
  onToggle: (path: string) => void;
  onOpenFile: (path: string) => void;
  onStartRename: (path: string) => void;
  onCancelRename: () => void;
  onCommitRename: (path: string, name: string) => void;
  onStartCreate: (parentPath: string, kind: FileNode["kind"]) => void;
  onCancelCreate: () => void;
  onCommitCreate: (
    parentPath: string,
    name: string,
    kind: FileNode["kind"],
  ) => void;
  onDelete: (path: string) => void;
}

function TreeNodes(props: TreeNodesProps) {
  const {
    nodes,
    depth,
    expanded,
    activePath,
    readOnly,
    renaming,
    pendingCreate,
    onToggle,
    onOpenFile,
    onStartRename,
    onCancelRename,
    onCommitRename,
    onStartCreate,
    onCancelCreate,
    onCommitCreate,
    onDelete,
  } = props;

  return (
    <ul role="group" className="m-0 list-none p-0">
      {nodes.map((node) => {
        const isExpanded = expanded.has(node.path);
        const isActive = activePath === node.path;
        const isRenaming = renaming === node.path;
        return (
          <li
            key={node.path}
            role="treeitem"
            aria-expanded={isExpanded}
            aria-selected={isActive}
          >
            <TreeRow
              node={node}
              depth={depth}
              expanded={isExpanded}
              active={isActive}
              renaming={isRenaming}
              readOnly={readOnly}
              onToggle={() => onToggle(node.path)}
              onOpenFile={() => onOpenFile(node.path)}
              onStartRename={() => onStartRename(node.path)}
              onCancelRename={onCancelRename}
              onCommitRename={(name) => onCommitRename(node.path, name)}
              onStartCreate={(kind) => onStartCreate(node.path, kind)}
              onDelete={() => onDelete(node.path)}
            />
            {node.kind === "directory" && isExpanded ? (
              <>
                <TreeNodes
                  nodes={node.children ?? []}
                  depth={depth + 1}
                  expanded={expanded}
                  activePath={activePath}
                  readOnly={readOnly}
                  renaming={renaming}
                  pendingCreate={pendingCreate}
                  onToggle={onToggle}
                  onOpenFile={onOpenFile}
                  onStartRename={onStartRename}
                  onCancelRename={onCancelRename}
                  onCommitRename={onCommitRename}
                  onStartCreate={onStartCreate}
                  onCancelCreate={onCancelCreate}
                  onCommitCreate={onCommitCreate}
                  onDelete={onDelete}
                />
                {pendingCreate?.parentPath === node.path ? (
                  <NewNodeRow
                    depth={depth + 1}
                    kind={pendingCreate.kind}
                    onCancel={onCancelCreate}
                    onCommit={(name) =>
                      onCommitCreate(node.path, name, pendingCreate.kind)
                    }
                  />
                ) : null}
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

interface TreeRowProps {
  node: FileNode;
  depth: number;
  expanded: boolean;
  active: boolean;
  renaming: boolean;
  readOnly: boolean;
  onToggle: () => void;
  onOpenFile: () => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onCommitRename: (name: string) => void;
  onStartCreate: (kind: FileNode["kind"]) => void;
  onDelete: () => void;
}

function TreeRow(props: TreeRowProps) {
  const {
    node,
    depth,
    expanded,
    active,
    renaming,
    readOnly,
    onToggle,
    onOpenFile,
    onStartRename,
    onCancelRename,
    onCommitRename,
    onStartCreate,
    onDelete,
  } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const isDir = node.kind === "directory";

  function handleClick() {
    if (renaming) return;
    if (isDir) onToggle();
    else onOpenFile();
  }

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (renaming) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    } else if (!readOnly && e.key === "F2") {
      e.preventDefault();
      onStartRename();
    } else if (!readOnly && e.key === "Delete") {
      e.preventDefault();
      onDelete();
    }
  }

  return (
    <div
      className={cn(
        "group/row hover:bg-accent/30 flex items-center gap-1 px-1.5 py-0.5 text-sm",
        active && "bg-accent/50",
      )}
      style={{ paddingLeft: 8 + depth * 12 }}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKey}
      role="button"
    >
      <span className="flex w-4 shrink-0 items-center justify-center">
        {isDir ? (
          <ChevronRight
            className={cn(
              "text-muted-foreground h-3 w-3 transition-transform",
              expanded && "rotate-90",
            )}
            aria-hidden
          />
        ) : null}
      </span>
      <span className="text-muted-foreground flex w-4 shrink-0 items-center justify-center">
        {isDir ? (
          expanded ? (
            <FolderOpen className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Folder className="h-3.5 w-3.5" aria-hidden />
          )
        ) : (
          <FileCode className="h-3.5 w-3.5" aria-hidden />
        )}
      </span>
      {renaming ? (
        <InlineNameInput
          initial={node.name}
          onCancel={onCancelRename}
          onCommit={onCommitRename}
        />
      ) : (
        <span className="text-foreground truncate">{node.name}</span>
      )}

      {!renaming && !readOnly ? (
        <span
          className={cn(
            "ml-auto flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100",
            menuOpen && "opacity-100",
          )}
        >
          {isDir ? (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="New file"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartCreate("file");
                }}
              >
                <FilePlus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="New folder"
                onClick={(e) => {
                  e.stopPropagation();
                  onStartCreate("directory");
                }}
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Rename"
            onClick={(e) => {
              e.stopPropagation();
              onStartRename();
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(true);
              if (
                typeof window !== "undefined" &&
                window.confirm(`Delete "${node.name}"?`)
              ) {
                onDelete();
              }
              setMenuOpen(false);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <span className="sr-only">
            <MoreVertical />
          </span>
        </span>
      ) : null}
    </div>
  );
}

function NewNodeRow({
  depth,
  kind,
  onCancel,
  onCommit,
}: {
  depth: number;
  kind: FileNode["kind"];
  onCancel: () => void;
  onCommit: (name: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-1 px-1.5 py-0.5 text-sm"
      style={{ paddingLeft: 8 + depth * 12 }}
    >
      <span className="w-4" />
      <span className="text-muted-foreground flex w-4 shrink-0 items-center justify-center">
        {kind === "directory" ? (
          <Folder className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <FileCode className="h-3.5 w-3.5" aria-hidden />
        )}
      </span>
      <InlineNameInput initial="" onCancel={onCancel} onCommit={onCommit} />
    </div>
  );
}

function InlineNameInput({
  initial,
  onCancel,
  onCommit,
}: {
  initial: string;
  onCancel: () => void;
  onCommit: (name: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function commit() {
    const trimmed = value.trim();
    if (!trimmed || trimmed === initial) {
      onCancel();
      return;
    }
    onCommit(trimmed);
  }

  return (
    <Input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      className="h-6 px-1 py-0 text-xs"
    />
  );
}
