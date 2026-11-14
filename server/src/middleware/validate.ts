import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

/**
 * Parses and replaces request parts with their validated, typed form.
 * Unknown keys are stripped by Zod, so nothing unvalidated reaches a service.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (schemas.params) {
      Object.defineProperty(req, 'params', { value: schemas.params.parse(req.params), writable: true, configurable: true });
    }
    if (schemas.query) {
      // Express 5 exposes `query` as a getter, so redefine it on the instance.
      Object.defineProperty(req, 'query', { value: schemas.query.parse(req.query), writable: true, configurable: true });
    }
    if (schemas.body) req.body = schemas.body.parse(req.body ?? {});
    next();
  };
}
