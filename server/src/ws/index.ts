/**
 * Socket.io server — realtime layer.
 *
 *   - One ROOM per sessionId (`session:<uuid>`).
 *   - One process, in-memory only (Phase 7 target). The eventBus + room
 *     abstraction is structured so the socket.io Redis adapter can plug in
 *     later without touching handler code.
 *   - Auth on EVERY (re)connect via the same `verifyAccessToken` that
 *     protects HTTP requests.
 *   - `connectionStateRecovery` is on — short blips (≤ 2 min) replay missed
 *     server-emitted events automatically.
 *   - On reconnect the server pushes a fresh file-tree snapshot + the list
 *     of live terminal tabs so the client can re-subscribe; per-tab ring
 *     buffers replay missed output.
 *
 * Every handler is wrapped — a thrown error becomes a typed ack response
 * AND/OR an `error:typed` server-push, never a socket disconnect.
 */
import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { corsOrigins } from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import { eventBus } from '@/utils/eventBus.js';
import { sessionsDal, designDocumentsDal } from '@/dal/index.js';
import { authenticateHandshake } from './auth.js';
import { sharePresence } from '@/services/sharePresence.js';
import { designPresence } from '@/services/designPresence.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError, RoomFullError, UnauthorizedError } from '@/errors/index.js';
import { DESIGN_ROOM_MAX_PEERS, type DesignJoinResponse, type DesignDocumentDTO } from '@/contracts/index.js';
import type { Session } from '@/db/schema/index.js';
import {
  createDirectory,
  deleteFile,
  listTree,
  readFile,
  renameFile,
  writeFile,
} from '@/services/fileSync.js';
import { previewForSession } from '@/services/previewService.js';
import { terminalManager } from '@/services/terminalManager.js';
import { treeWatcher } from '@/services/treeWatcher.js';
import { dbShellKindFor, shellCommandFor, shellLabelFor, type ShellKind } from '@/services/dbShell.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  TypedError,
} from './types.js';

export type AppIOServer = IOServer<ClientToServerEvents, ServerToClientEvents, never, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>;

const SESSION_ROOM = (id: string) => `session:${id}`;
const DESIGN_ROOM = (id: string) => `design:${id}`;

// ---------------------------------------------------------------------------

export function createSocketServer(httpServer: HttpServer): AppIOServer {
  const io: AppIOServer = new IOServer(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
    pingInterval: 20_000,
    pingTimeout: 10_000,
    // Short blips don't disconnect; the client picks up where it left off
    // and we don't have to redo handshake/auth for those.
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: false, // re-run auth middleware on recovery
    },
  });

  // ---- handshake auth (runs on connect AND on connectionStateRecovery) ----
  io.use(async (socket, next) => {
    try {
      const identity = await authenticateHandshake(socket);
      if (identity.role === 'candidate') {
        // role on SocketData is a ShareRole; design_guest is tracked separately
        // under socket.data.designRole so the existing code-session gates
        // (canEdit, etc.) stay untouched.
        socket.data.role = 'candidate';
        socket.data.userId = '';
        socket.data.sessionId = identity.sessionId;
        socket.data.shareToken = identity.shareToken;
      } else if (identity.role === 'design_guest') {
        // Design guest — set a sentinel role so the existing code-session
        // gates ignore this socket, and stash the design fields.
        socket.data.role = 'candidate';
        socket.data.userId = '';
        socket.data.designRole = 'design_guest';
        socket.data.designDocId = identity.docId;
        socket.data.designShareToken = identity.designShareToken;
      } else {
        socket.data.role = 'interviewer';
        socket.data.userId = identity.userId;
      }
      next();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'auth failed';
      logger.warn({ err, sid: socket.id }, 'ws handshake auth failed');
      next(new Error(message));
    }
  });

  // ---- bus → room relays ----
  eventBus.on('session.event', ({ sessionId, event }) => {
    io.to(SESSION_ROOM(sessionId)).emit('lifecycle:event', event);
  });
  eventBus.on('session.status', ({ sessionId, status }) => {
    io.to(SESSION_ROOM(sessionId)).emit('lifecycle:status', { sessionId, status });
  });
  // Candidate presence change → tell the room so the interviewer flips
  // read-only/editable.
  eventBus.on('share.state', ({ sessionId, candidatePresent }) => {
    io.to(SESSION_ROOM(sessionId)).emit('share:state', { candidatePresent });
  });
  // Owner revoked / deleted a shared design doc → evict everyone in the room.
  eventBus.on('design.closed', ({ docId, reason }) => {
    io.to(DESIGN_ROOM(docId)).emit('design:closed', { docId, reason });
    // Disconnect guest sockets so they don't sit on a dead handle. The owner
    // socket (if any) might still want to use other rooms; leave it.
    for (const [sid, s] of io.sockets.sockets) {
      const sock = s as AppSocket;
      if (sock.data.designDocId === docId && sock.data.designRole === 'design_guest') {
        sock.disconnect(true);
        logger.debug({ sid, docId, reason }, 'design guest socket evicted');
      }
    }
  });

  // ---- per-socket wiring ----
  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    logger.debug(
      { sid: socket.id, userId, recovered: socket.recovered },
      'ws connection',
    );

    // After a recovery (short blip), tell the client the socket is back.
    if (socket.recovered) {
      socket.emit('connection:health', { status: 'connected', recovered: true });
    } else {
      socket.emit('connection:health', { status: 'connected', recovered: false });
    }

    socket.on('disconnect', (reason) => {
      logger.debug({ sid: socket.id, userId, role: socket.data.role, reason }, 'ws disconnect');
      // Stop watching every session this socket had open. The poller stops
      // when the last watcher for a session leaves.
      treeWatcher.unwatchAll(socket.id);
      // A candidate dropping (tab close / network) releases the slot after a
      // short grace, which unlocks the interviewer.
      if (socket.data.role === 'candidate' && socket.data.sessionId && !socket.data.designDocId) {
        sharePresence.release(socket.data.sessionId, socket.id);
      }
      // Design-room peer dropping — release the slot immediately and tell the
      // remaining peers about the new roster. No grace because slots are
      // capped at 5 and we want to free space fast if someone closes a tab.
      if (socket.data.designDocId && socket.data.designPeerId) {
        const docId = socket.data.designDocId;
        designPresence.leave(docId, socket.data.designPeerId);
        io.to(DESIGN_ROOM(docId)).emit('design:presence', {
          docId,
          peers: designPresence.peers(docId),
        });
      }
    });

    // ---- session:join ----
    wrap(socket, 'session:join', async (payload, ack) => {
      const session = await authorizeSession(socket, payload.sessionId);
      socket.data.sessionId = session.id;
      socket.data.containerId = session.containerId ?? undefined;

      // Candidate claims the single occupancy slot — refuse if already taken.
      if (socket.data.role === 'candidate') {
        const claimed = sharePresence.claim(session.id, socket.id);
        if (!claimed) {
          throw new ConflictError('Another candidate is already in this session', {
            reason: 'share_in_use',
          });
        }
      }

      await socket.join(SESSION_ROOM(session.id));
      const tabs = terminalManager.listTabsForSession(session.id);
      // Start (or join) the out-of-band tree watcher so terminal-driven file
      // changes show up in the tree without the client polling.
      if (session.containerId) {
        treeWatcher.watch(session.id, session.containerId, socket.id, () => {
          io.to(SESSION_ROOM(session.id)).emit('fs:invalidate', { reason: 'fs-change' });
        });
      }
      const dbShell = dbShellKindFor(
        session.framework,
        session.customization as Record<string, unknown>,
      );
      const readOnly = !sharePresence.canEdit(session.id, socket.data.role, socket.id);
      ack({
        ok: true,
        session,
        preview: previewForSession(session),
        tabs,
        dbShell,
        role: socket.data.role,
        readOnly,
      });
    });

    // ---- files ----
    wrap(socket, 'file:tree', async (_payload, ack) => {
      const { containerId } = await requireJoined(socket);
      const tree = await listTree(containerId);
      ack({ tree });
    });

    wrap(socket, 'file:read', async (payload, ack) => {
      const { sessionId, containerId } = await requireJoined(socket);
      const r = await readFile(sessionId, containerId, payload.path);
      ack({ ok: true, ...r });
    });

    wrap(socket, 'file:write', async (payload, ack) => {
      const { sessionId, containerId } = await requireJoined(socket);
      assertCanEdit(socket, sessionId);
      const r = await writeFile({
        sessionId,
        containerId,
        path: payload.path,
        content: payload.content,
        expectedVersion: payload.expectedVersion,
      });
      ack({ ok: true, ...r });
      io.to(SESSION_ROOM(sessionId)).emit('file:changed', {
        path: r.path,
        version: r.version,
        kind: 'write',
      });
    });

    wrap(socket, 'file:delete', async (payload, ack) => {
      const { sessionId, containerId } = await requireJoined(socket);
      assertCanEdit(socket, sessionId);
      await deleteFile(containerId, sessionId, payload.path);
      ack({ ok: true });
      io.to(SESSION_ROOM(sessionId)).emit('file:changed', {
        path: payload.path,
        version: 0,
        kind: 'delete',
      });
    });

    wrap(socket, 'file:rename', async (payload, ack) => {
      const { sessionId, containerId } = await requireJoined(socket);
      assertCanEdit(socket, sessionId);
      await renameFile(containerId, sessionId, payload.from, payload.to);
      ack({ ok: true });
      io.to(SESSION_ROOM(sessionId)).emit('file:changed', {
        path: payload.to,
        from: payload.from,
        version: 0,
        kind: 'rename',
      });
    });

    wrap(socket, 'file:mkdir', async (payload, ack) => {
      const { sessionId, containerId } = await requireJoined(socket);
      assertCanEdit(socket, sessionId);
      await createDirectory(containerId, payload.path);
      ack({ ok: true });
    });

    // ---- terminal ----
    wrap(socket, 'term:open', async (payload, ack) => {
      const { sessionId, containerId } = await requireJoined(socket);
      assertCanEdit(socket, sessionId);
      const kind: ShellKind = payload.kind ?? 'shell';
      const label = shellLabelFor(kind);
      const tabId = await terminalManager.openTab(
        {
          sessionId,
          containerId,
          cols: payload.cols ?? 80,
          rows: payload.rows ?? 24,
          kind,
          label,
          cmd: shellCommandFor(kind),
        },
        {
          onData: (chunk) =>
            io.to(SESSION_ROOM(sessionId)).emit('term:data', {
              tabId,
              data: chunk.toString('utf8'),
            }),
          onClose: (exitCode) =>
            io.to(SESSION_ROOM(sessionId)).emit('term:exit', { tabId, exitCode }),
        },
      );
      ack({ tabId, kind, label });
    });

    wrap(socket, 'term:reattach', async (payload, ack) => {
      const { sessionId } = await requireJoined(socket);
      const info = terminalManager.reattach(payload.tabId, {
        onData: (chunk) =>
          io.to(SESSION_ROOM(sessionId)).emit('term:data', {
            tabId: payload.tabId,
            data: chunk.toString('utf8'),
          }),
        onClose: (exitCode) =>
          io.to(SESSION_ROOM(sessionId)).emit('term:exit', { tabId: payload.tabId, exitCode }),
      });
      if (!info) throw new NotFoundError(`tab ${payload.tabId} not found`);
      ack({
        tabId: payload.tabId,
        backlog: info.backlog.toString('utf8'),
        cols: info.cols,
        rows: info.rows,
        kind: info.kind,
        label: info.label,
      });
    });

    socket.on('term:write', (payload) => {
      try {
        const sessionId = socket.data.sessionId;
        if (!sessionId) return;
        // Read-only observers (interviewer while a candidate is editing) can
        // watch the terminal but can't type into it — drop input silently
        // (per-keystroke, so no error spam; the UI disables it anyway).
        if (!sharePresence.canEdit(sessionId, socket.data.role, socket.id)) return;
        terminalManager.write(payload.tabId, payload.data);
      } catch (err) {
        emitErr(socket, err);
      }
    });

    socket.on('term:resize', (payload) => {
      try {
        if (!socket.data.sessionId) return;
        void terminalManager.resize(payload.tabId, payload.cols, payload.rows);
      } catch (err) {
        emitErr(socket, err);
      }
    });

    wrap(socket, 'term:close', async (payload, ack) => {
      const { sessionId } = await requireJoined(socket);
      assertCanEdit(socket, sessionId);
      await terminalManager.close(payload.tabId);
      ack({ ok: true });
    });

    // ---- sharing: candidate explicitly leaves ----
    wrap(socket, 'share:leave', async (_payload, ack) => {
      if (socket.data.role === 'candidate' && socket.data.sessionId && !socket.data.designDocId) {
        // Immediate release (no grace) so the interviewer is unlocked at once.
        sharePresence.release(socket.data.sessionId, socket.id, true);
      }
      ack({ ok: true });
    });

    // ---- design canvas (multi-user) -----------------------------------
    // Join a design room as either the doc owner (JWT) or a guest (handshake
    // token). Up to DESIGN_ROOM_MAX_PEERS per room; everyone admitted has
    // equal edit rights.
    wrap(socket, 'design:join', async (payload, ack) => {
      const docId = payload.docId;
      const role = await authorizeDesignJoin(socket, docId);

      const peer = designPresence.join(docId, socket.id, role);
      if (!peer) {
        throw new RoomFullError('This design canvas already has the max number of peers', {
          maxPeers: DESIGN_ROOM_MAX_PEERS,
        });
      }
      socket.data.designDocId = docId;
      socket.data.designRole = role;
      socket.data.designPeerId = peer.peerId;
      socket.data.designName = peer.name;
      socket.data.designColor = peer.color;

      await socket.join(DESIGN_ROOM(docId));

      // Load the live document for hydration on the joining client.
      const doc = await designDocumentsDal.findByShareToken(
        socket.data.designShareToken ?? '',
      );
      // Owner path didn't pass a token — load by id directly.
      const fresh = doc ?? (await designDocumentsDal.findById(docId));
      if (!fresh) {
        designPresence.leave(docId, peer.peerId);
        throw new NotFoundError('Design document not found');
      }

      // Announce the new roster to everyone in the room.
      io.to(DESIGN_ROOM(docId)).emit('design:presence', {
        docId,
        peers: designPresence.peers(docId),
      });

      const resp: DesignJoinResponse = {
        ok: true,
        docId,
        self: peer,
        peers: designPresence.peers(docId),
        document: fresh as unknown as DesignDocumentDTO,
        maxPeers: DESIGN_ROOM_MAX_PEERS,
      };
      ack(resp);
    });

    wrap(socket, 'design:leave', async (_payload, ack) => {
      const docId = socket.data.designDocId;
      const peerId = socket.data.designPeerId;
      if (docId && peerId) {
        designPresence.leave(docId, peerId);
        await socket.leave(DESIGN_ROOM(docId));
        io.to(DESIGN_ROOM(docId)).emit('design:presence', {
          docId,
          peers: designPresence.peers(docId),
        });
        socket.data.designDocId = undefined;
        socket.data.designPeerId = undefined;
      }
      ack({ ok: true });
    });

    // Cursor broadcast — fire-and-forget, no ack to keep latency low. Server
    // doesn't persist; remote clients render an overlay keyed by peerId.
    socket.on('design:cursor', (payload) => {
      const docId = socket.data.designDocId;
      const peerId = socket.data.designPeerId;
      if (!docId || !peerId) return;
      socket.to(DESIGN_ROOM(docId)).emit('design:cursor', {
        docId,
        peerId,
        x: payload.x,
        y: payload.y,
      });
    });

    // Scene broadcast + autosave. Every admitted peer can write; the room
    // membership IS the authorization. We update the doc by id directly so
    // guest writes also persist (matches the agreed "autosave" model).
    //
    // Fire-and-forget per contract (no ack), so we use raw `socket.on` —
    // `wrap` mis-parses single-arg events as `{}` because it pulls the last
    // arg as the ack callback.
    socket.on('design:scene', (payload) => {
      const docId = socket.data.designDocId;
      const peerId = socket.data.designPeerId;
      if (!docId || !peerId) return;
      // Fan out FIRST (cheap, low-latency) so peers see the change without
      // waiting for the DB round-trip.
      socket.to(DESIGN_ROOM(docId)).emit('design:scene', {
        docId,
        peerId,
        document: payload.document,
      });
      // Persist best-effort. Failure is logged; we don't bubble it to the
      // sender — they'll retry on the next change.
      void designDocumentsDal
        .updateDocumentById(docId, payload.document)
        .catch((err: unknown) =>
          logger.warn({ err, docId, peerId }, 'design scene autosave failed'),
        );
    });
  });

  return io;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wrap an ack-style handler so any thrown error becomes a typed ack response
 * + an `error:typed` push. Never disconnects the socket.
 */
type PayloadOf<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]>[0];
type AckOf<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]>[1];

function wrap<E extends keyof ClientToServerEvents>(
  socket: AppSocket,
  event: E,
  handler: (payload: PayloadOf<E>, ack: NonNullable<AckOf<E>>) => Promise<unknown>,
): void {
  // socket.on for typed servers has wide overloads — we cast to a plain
  // varargs listener at the boundary and recover types via the generics.
  (socket.on as unknown as (e: string, fn: (...args: unknown[]) => void) => void)(
    event,
    (...args: unknown[]) => {
      const ack = args[args.length - 1];
      const payload = (args.length > 1 ? args[0] : {}) as PayloadOf<E>;
      const safeAck = ((resp: unknown) => {
        if (typeof ack === 'function') (ack as (r: unknown) => void)(resp);
      }) as NonNullable<AckOf<E>>;
      void (async () => {
        try {
          await handler(payload, safeAck);
        } catch (err) {
          const typed = toTypedError(err);
          logger.warn({ err, event, sid: socket.id }, 'ws handler error');
          if (typeof ack === 'function') (ack as (r: unknown) => void)(typed);
          else socket.emit('error:typed', typed.error);
        }
      })();
    },
  );
}

function toTypedError(err: unknown): TypedError {
  if (err instanceof AppError) {
    return {
      ok: false,
      error: { code: err.code, message: err.message, details: err.details },
    };
  }
  return {
    ok: false,
    error: { code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) },
  };
}

function emitErr(socket: AppSocket, err: unknown): void {
  const typed = toTypedError(err);
  logger.warn({ err, sid: socket.id }, 'ws fire-and-forget handler error');
  socket.emit('error:typed', typed.error);
}

/**
 * Authorize a socket for a session, role-aware:
 *   - interviewer → must OWN the session (JWT user id matches).
 *   - candidate   → the share token must still resolve to THIS session AND not
 *                   be revoked/ended (re-checked on every op, so revoking the
 *                   link or ending the session cuts the candidate off).
 */
async function authorizeSession(socket: AppSocket, sessionId: string): Promise<Session> {
  const session = await sessionsDal.findById(sessionId);
  if (!session) throw new NotFoundError(`Session ${sessionId} not found`);

  if (socket.data.role === 'candidate') {
    if (session.id !== socket.data.sessionId) throw new ForbiddenError();
    if (!session.shareToken || session.shareToken !== socket.data.shareToken) {
      throw new UnauthorizedError('Share link is no longer valid');
    }
    if (session.status === 'ended' || session.status === 'error') {
      throw new ForbiddenError('Session has ended');
    }
    return session;
  }

  // interviewer
  if (!socket.data.userId) throw new UnauthorizedError();
  if (session.userId !== socket.data.userId) throw new ForbiddenError();
  return session;
}

async function requireJoined(socket: AppSocket): Promise<{
  sessionId: string;
  containerId: string;
}> {
  const sessionId = socket.data.sessionId;
  if (!sessionId) throw new ForbiddenError('socket has not joined a session');
  // Re-authorize on EVERY operation. Cheap (single PK lookup) and catches a
  // session DELETEd via HTTP, or a share link revoked, after the socket joined.
  const session = await authorizeSession(socket, sessionId);
  if (!session.containerId) throw new NotFoundError('Session has no container yet');
  socket.data.containerId = session.containerId;
  return { sessionId: session.id, containerId: session.containerId };
}

/** Throw unless this socket is the current active editor (see sharePresence). */
function assertCanEdit(socket: AppSocket, sessionId: string): void {
  if (!sharePresence.canEdit(sessionId, socket.data.role, socket.id)) {
    throw new ForbiddenError('Session is read-only — a candidate is currently editing');
  }
}

/**
 * Decide whether this socket may join the requested design room, and return
 * the role it should hold.
 *
 *   - design_guest → handshake supplied a share token; the token must still
 *     resolve to this exact docId (catches revoke + delete).
 *   - design_owner → JWT-authenticated user must OWN the doc.
 */
async function authorizeDesignJoin(
  socket: AppSocket,
  docId: string,
): Promise<'design_owner' | 'design_guest'> {
  if (socket.data.designRole === 'design_guest') {
    if (socket.data.designDocId !== docId) {
      throw new ForbiddenError('Share token does not authorize this design document');
    }
    const token = socket.data.designShareToken;
    if (!token) throw new UnauthorizedError('Missing share token');
    const doc = await designDocumentsDal.findByShareToken(token);
    if (!doc || doc.id !== docId) {
      throw new UnauthorizedError('Share link is no longer valid');
    }
    return 'design_guest';
  }

  // Owner path — must be an authenticated user and own the doc.
  if (!socket.data.userId) throw new UnauthorizedError();
  const doc = await designDocumentsDal.getByIdForUser(docId, socket.data.userId);
  if (!doc) throw new NotFoundError(`Design document ${docId} not found`);
  return 'design_owner';
}
