import type { FileNode } from "@/types/session";

/** Sort directories first, then files; case-insensitive name order. */
export function sortTree(nodes: FileNode[] | undefined): FileNode[] {
  if (!nodes) return [];
  const sorted = [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return sorted.map((n) =>
    n.kind === "directory" && n.children
      ? { ...n, children: sortTree(n.children) }
      : n,
  );
}

/** Find a node by absolute path. */
export function findNode(
  root: FileNode[] | undefined,
  path: string,
): FileNode | null {
  if (!root) return null;
  for (const n of root) {
    if (n.path === path) return n;
    if (n.kind === "directory" && n.children) {
      const hit = findNode(n.children, path);
      if (hit) return hit;
    }
  }
  return null;
}

/** Insert a node into the tree at the parent path. */
export function insertNode(
  root: FileNode[],
  parentPath: string,
  node: FileNode,
): FileNode[] {
  if (parentPath === "/" || parentPath === "") {
    return sortTree([...root, node]);
  }
  return root.map((n) => {
    if (n.path === parentPath && n.kind === "directory") {
      return {
        ...n,
        children: sortTree([...(n.children ?? []), node]),
      };
    }
    if (n.kind === "directory" && n.children) {
      return { ...n, children: insertNode(n.children, parentPath, node) };
    }
    return n;
  });
}

/**
 * Insert a leaf at `targetPath`, creating any missing ancestor directories
 * along the way. Idempotent — if some or all ancestors already exist they're
 * reused. Used when a `file:changed` broadcast lands for a file whose parent
 * dirs weren't in the tree yet (the server's listTree is flat, and freshly-
 * created paths can be arbitrarily deep).
 */
export function insertLeafWithParents(
  root: FileNode[],
  targetPath: string,
  kind: FileNode["kind"],
): FileNode[] {
  const segments = targetPath.split("/").filter(Boolean);
  if (segments.length === 0) return root;

  function walk(level: FileNode[], depth: number, prefix: string): FileNode[] {
    const seg = segments[depth];
    const fullPath = prefix ? `${prefix}/${seg}` : seg;
    const isLeaf = depth === segments.length - 1;
    const existing = level.find((n) => n.name === seg);

    if (existing) {
      if (isLeaf) return level; // node already present, nothing to do
      if (existing.kind !== "directory") return level; // refuse to walk into a file
      return level.map((n) =>
        n === existing
          ? {
              ...n,
              children: walk(n.children ?? [], depth + 1, fullPath),
            }
          : n,
      );
    }

    const newNode: FileNode = isLeaf
      ? { path: fullPath, name: seg, kind }
      : {
          path: fullPath,
          name: seg,
          kind: "directory",
          children: walk([], depth + 1, fullPath),
        };
    return sortTree([...level, newNode]);
  }

  return walk(root, 0, "");
}

/** Remove a node by absolute path. */
export function removeNode(root: FileNode[], path: string): FileNode[] {
  return root
    .filter((n) => n.path !== path)
    .map((n) =>
      n.kind === "directory" && n.children
        ? { ...n, children: removeNode(n.children, path) }
        : n,
    );
}

/** Rename a node in place (within its current parent). */
export function renameNode(
  root: FileNode[],
  fromPath: string,
  toPath: string,
): FileNode[] {
  const toName = toPath.split("/").pop() ?? toPath;
  return root.map((n) => {
    if (n.path === fromPath) {
      return rewritePath(n, fromPath, toPath, toName);
    }
    if (n.kind === "directory" && n.children) {
      return { ...n, children: renameNode(n.children, fromPath, toPath) };
    }
    return n;
  });
}

function rewritePath(
  node: FileNode,
  oldPrefix: string,
  newPrefix: string,
  newName: string,
): FileNode {
  const newPath = node.path === oldPrefix ? newPrefix : node.path.replace(
    oldPrefix,
    newPrefix,
  );
  const next: FileNode = {
    ...node,
    path: newPath,
    name: node.path === oldPrefix ? newName : node.name,
  };
  if (node.kind === "directory" && node.children) {
    next.children = node.children.map((c) =>
      rewritePath(c, oldPrefix, newPrefix, c.name),
    );
  }
  return next;
}

export function languageFromExt(name: string): string {
  const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "json":
      return "json";
    case "css":
      return "css";
    case "scss":
    case "sass":
      return "scss";
    case "html":
    case "htm":
      return "html";
    case "md":
    case "markdown":
      return "markdown";
    case "py":
      return "python";
    case "go":
      return "go";
    case "rs":
      return "rust";
    case "java":
      return "java";
    case "cpp":
    case "cc":
    case "cxx":
    case "h":
    case "hpp":
      return "cpp";
    case "c":
      return "c";
    case "sh":
    case "bash":
      return "shell";
    case "yml":
    case "yaml":
      return "yaml";
    case "toml":
      return "toml";
    case "sql":
      return "sql";
    default:
      return "plaintext";
  }
}
