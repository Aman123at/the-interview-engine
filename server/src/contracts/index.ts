/**
 * Shared client/server contract. Authored in the SERVER repo; copied verbatim
 * into the client via `pnpm contracts:sync`. The only runtime dep is `zod`.
 *
 * Import surface:
 *   - enums:     literal unions + zod enums (SessionStatus, FrameworkId, ...)
 *   - http:      request/response schemas + types for every endpoint
 *   - ws:        socket.io event surface (ClientToServerEvents, etc.)
 */
export * from './enums.js';
export * from './ws.js';
export * from './http.js';
export * from './design.js';
