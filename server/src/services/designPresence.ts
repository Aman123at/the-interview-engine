/**
 * In-memory presence registry for SHARED design-canvas rooms.
 *
 * Unlike `sharePresence` (which enforces a SINGLE candidate with a read-only
 * swap), a design room is MULTI-USER (up to DESIGN_ROOM_MAX_PEERS) and there
 * is no read-only swap: every admitted peer can draw, drag stencils, and
 * autosave. The owner is admitted by JWT; guests are admitted by share token.
 *
 * Single-process (v1). A future Redis-backed adapter would swap the internal
 * Map for a shared store without changing call sites.
 *
 * Peers carry a stable peerId (the socket id, since rooms can't outlive a
 * socket today), a server-assigned display name, and a deterministic color so
 * cursor overlays don't flicker between renders. Names come from a small
 * "friendly noun" pool; collisions inside one room are de-duped with a
 * numeric suffix.
 */
import { DESIGN_ROOM_MAX_PEERS, type DesignPeer, type DesignRole } from '@/contracts/index.js';
import { logger } from '@/utils/logger.js';

// Pleasant 12-color palette, picked for high mutual contrast on both light
// and dark canvases. Index is taken from a fast hash of the peerId so the
// same peer keeps the same color across reconnects (within a room lifetime).
const COLORS = [
  '#e11d48', // rose-600
  '#f97316', // orange-500
  '#eab308', // yellow-500
  '#22c55e', // green-500
  '#10b981', // emerald-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#6366f1', // indigo-500
  '#a855f7', // purple-500
  '#ec4899', // pink-500
  '#f43f5e', // rose-500
  '#84cc16', // lime-500
];

// Friendly nouns — easier to remember than random hex. The dialog says we
// can use any random name; this is the "any" pool. The owner is given a
// special "Owner" label so guests can tell them apart at a glance.
const NAME_POOL = [
  'Otter',
  'Falcon',
  'Panda',
  'Lynx',
  'Heron',
  'Beluga',
  'Marmot',
  'Robin',
  'Gecko',
  'Wolf',
  'Hedgehog',
  'Puffin',
  'Tapir',
  'Mantis',
  'Koala',
  'Quokka',
];

function pickColor(peerId: string): string {
  let h = 0;
  for (let i = 0; i < peerId.length; i++) h = (h * 31 + peerId.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

interface RoomEntry {
  /** peerId → peer */
  peers: Map<string, DesignPeer>;
}

const rooms = new Map<string, RoomEntry>();

function getOrCreateRoom(docId: string): RoomEntry {
  let r = rooms.get(docId);
  if (!r) {
    r = { peers: new Map() };
    rooms.set(docId, r);
  }
  return r;
}

function uniqueName(room: RoomEntry, base: string): string {
  if (!hasName(room, base)) return base;
  // Otter, Otter 2, Otter 3, …
  for (let i = 2; i < 100; i++) {
    const candidate = `${base} ${i}`;
    if (!hasName(room, candidate)) return candidate;
  }
  return `${base} ${Date.now() % 1000}`;
}

function hasName(room: RoomEntry, name: string): boolean {
  for (const p of room.peers.values()) if (p.name === name) return true;
  return false;
}

export const designPresence = {
  /** Hard cap so the WS handshake can refuse early. */
  isFull(docId: string): boolean {
    return (rooms.get(docId)?.peers.size ?? 0) >= DESIGN_ROOM_MAX_PEERS;
  },

  size(docId: string): number {
    return rooms.get(docId)?.peers.size ?? 0;
  },

  peers(docId: string): DesignPeer[] {
    const r = rooms.get(docId);
    if (!r) return [];
    return Array.from(r.peers.values());
  },

  /**
   * Admit a peer to the room. Returns the peer (with assigned name + color),
   * or `null` if the room is at capacity. Owner gets the fixed "Owner" name;
   * guests get a friendly noun from the pool, de-duped per-room.
   */
  join(
    docId: string,
    peerId: string,
    role: DesignRole,
  ): DesignPeer | null {
    const room = getOrCreateRoom(docId);
    // Re-join from the same peerId (e.g. socket recovery) → update role,
    // keep identity so cursor color/name don't flicker.
    const existing = room.peers.get(peerId);
    if (existing) {
      existing.role = role;
      return existing;
    }
    if (room.peers.size >= DESIGN_ROOM_MAX_PEERS) {
      return null;
    }
    const baseName =
      role === 'design_owner'
        ? 'Owner'
        : NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)]!;
    const name = uniqueName(room, baseName);
    const peer: DesignPeer = {
      peerId,
      name,
      color: pickColor(peerId),
      role,
    };
    room.peers.set(peerId, peer);
    logger.debug({ docId, peerId, role, name }, 'designPresence: peer joined');
    return peer;
  },

  /** Drop a peer. Returns true if the room is now empty. */
  leave(docId: string, peerId: string): boolean {
    const room = rooms.get(docId);
    if (!room) return true;
    room.peers.delete(peerId);
    logger.debug({ docId, peerId }, 'designPresence: peer left');
    if (room.peers.size === 0) {
      rooms.delete(docId);
      return true;
    }
    return false;
  },

  /** Forget a room entirely (on revoke / delete). */
  forget(docId: string): void {
    rooms.delete(docId);
  },
};
