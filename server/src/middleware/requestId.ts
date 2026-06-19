import type { RequestHandler } from 'express';
import { nanoid } from 'nanoid';

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  const id = incoming && incoming.length <= 128 ? incoming : nanoid(12);
  req.id = id;
  res.setHeader('x-request-id', id);
  next();
};
