/**
 * Maps a (framework, customization, sessionId, hostPreviewPort) tuple to the
 * metadata the client needs to render a preview surface.
 *
 *   - `iframe` — the framework serves an HTTP UI (React/Vite, Next.js,
 *                plain JS sandbox). Client embeds an iframe @ `url`.
 *   - `api`    — there's an HTTP origin, but the framework returns
 *                JSON/API responses, not a UI. The API-client tab uses
 *                `url` as the base.
 *   - `none`   — no preview surface at all (cpp — terminal only).
 *
 * URL generation is centralized here so the localhost ↔ subdomain decision
 * lives in EXACTLY ONE place. The `preview_ready` event and session-metadata
 * responses both route through `previewForSession`.
 */
import { config, previewScheme } from '@/config/index.js';
import type { Session } from '@/db/schema/index.js';
import { containerDevPort } from './containerService.js';

export type PreviewKind = 'iframe' | 'api' | 'none';

export interface PreviewInfo {
  kind: PreviewKind;
  url: string | null;
  hostPort: number | null;
  hint: string | null;
}

/** Build the preview origin for a session, or null if there's no preview. */
export function previewUrlFor(
  sessionId: string,
  framework: string,
  customization: Record<string, unknown>,
  hostPort: number | null,
): string | null {
  if (containerDevPort(framework, customization) == null) return null;
  if (config.PREVIEW_MODE === 'subdomain') {
    return `${previewScheme}://${sessionId}.${config.PREVIEW_BASE_DOMAIN}`;
  }
  if (hostPort == null) return null;
  return `http://localhost:${hostPort}`;
}

export function previewFor(
  sessionId: string,
  framework: string,
  customization: Record<string, unknown>,
  hostPort: number | null,
): PreviewInfo {
  const url = previewUrlFor(sessionId, framework, customization, hostPort);
  if (url == null) {
    return {
      kind: 'none',
      url: null,
      hostPort: null,
      hint:
        framework === 'cpp'
          ? 'C++ sandbox is terminal-only — compile and run from the integrated terminal'
          : 'No preview available for this framework',
    };
  }
  switch (framework) {
    case 'react':
    case 'javascript':
    case 'fullstack':
      return { kind: 'iframe', url, hostPort, hint: null };

    case 'node':
    case 'python':
    case 'golang':
      return {
        kind: 'api',
        url,
        hostPort,
        hint: `API base URL — send HTTP requests to ${url}`,
      };

    case 'cpp':
      return { kind: 'none', url: null, hostPort: null, hint: 'terminal-only' };

    default:
      return { kind: 'iframe', url, hostPort, hint: null };
  }
}

export function previewForSession(session: Session): PreviewInfo {
  return previewFor(
    session.id,
    session.framework,
    session.customization as Record<string, unknown>,
    session.hostPreviewPort,
  );
}
