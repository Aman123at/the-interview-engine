import { Router } from 'express';
import { getFrameworksConfig } from '@/services/frameworkConfig.js';
import type { FrameworksResponse } from '@/contracts/index.js';

export const configRouter = Router();

/**
 * Public framework + customization config. No auth required — the client
 * fetches this before login to render the framework picker / option groups.
 */
configRouter.get('/config/frameworks', (_req, res) => {
  const body: FrameworksResponse = getFrameworksConfig() as FrameworksResponse;
  res.json(body);
});
