import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError, type ZodTypeAny, type infer as ZodInfer } from 'zod';
import { HttpError, badRequest } from '../domain/errors.js';

/** Validate input; a failure becomes a 400 with the first problem spelled out. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): ZodInfer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.join('.') || 'body';
    throw badRequest('invalid_input', `${where}: ${issue?.message ?? 'invalid'}`);
  }
  return result.data;
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'route_not_found', message: `No route ${req.method} ${req.path}` } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, ...err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: 'invalid_input', message: err.issues[0]?.message ?? 'Invalid input' } });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'invalid_json', message: 'Body is not valid JSON' } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } });
};
