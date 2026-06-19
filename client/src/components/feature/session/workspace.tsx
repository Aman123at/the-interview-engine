"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { EditorPane, type EditorTab } from "./editor-pane";
import { FileTree } from "./file-tree";
import { TerminalPane } from "./terminal-pane";
import { useWorkspace } from "@/lib/hooks/use-workspace";
import type { SessionSocket } from "@/lib/socket";
import type { FileNode, PreviewInfo } from "@/types/session";

interface WorkspaceProps {
  socket: SessionSocket;
  sessionId: string;
  initialFiles: FileNode[];
  preview: PreviewInfo;
  /** When set, the terminal pane auto-opens a DB shell tab of this kind. */
  dbShell?: "psql" | "mongosh" | "mysql" | null;
  /** Read-only mode — interviewer while a candidate is editing. Disables file
   * mutations, the editor, terminal input, and the API client. */
  readOnly?: boolean;
  /** Candidate share token — routes the API client through the public proxy. */
  shareToken?: string;
}

export function Workspace({
  socket,
  sessionId,
  initialFiles,
  preview,
  dbShell,
  readOnly = false,
  shareToken,
}: WorkspaceProps) {
  const ws = useWorkspace(socket, initialFiles);

  const tabs: EditorTab[] = ws.openTabs.map((p) => {
    const name = p.split("/").pop() ?? p;
    const buf = ws.buffers[p];
    return {
      path: p,
      name,
      dirty: !!ws.dirtyByPath[p],
      loading: !!buf?.loading,
    };
  });

  const contentByPath: Record<string, string> = {};
  for (const [k, v] of Object.entries(ws.buffers)) contentByPath[k] = v.content;

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="border-border/60 flex-1 border-t"
    >
      <ResizablePanel defaultSize="20%" minSize="14%" maxSize="40%">
        <FileTree
          root={ws.files}
          loading={ws.filesLoading}
          activePath={ws.activePath}
          readOnly={readOnly}
          onOpenFile={ws.openFile}
          onCreate={(parentPath, name, kind) =>
            void ws.createNode(parentPath, name, kind)
          }
          onRename={(p, name) => void ws.renamePath(p, name)}
          onDelete={(p) => void ws.deletePath(p)}
        />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="80%">
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel defaultSize="65%" minSize="20%">
            <EditorPane
              tabs={tabs}
              sessionId={sessionId}
              activePath={ws.activePath}
              contentByPath={contentByPath}
              readOnly={readOnly}
              shareToken={shareToken}
              onSelect={(p) => {
                // The preview tab is a UI sentinel — flipping activePath to
                // it doesn't trigger a file read because selectFile only
                // updates `activePath`. File tabs reuse the same call.
                ws.selectFile(p);
              }}
              onClose={ws.closeFile}
              onChange={ws.setBufferContent}
              preview={preview}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="35%" minSize="15%">
            <TerminalPane socket={socket} dbShell={dbShell} readOnly={readOnly} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
