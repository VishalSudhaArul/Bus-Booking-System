import { Router } from 'express';
import { actorOf, authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { paginationQuery, query, sendOk } from '../../utils/http';
import * as service from './cancellation.service';

export const cancellationRouter = Router();

// One endpoint for all roles — the service scopes the result to the caller.
cancellationRouter.get('/', authenticate, validate({ query: paginationQuery }), async (req, res) => {
  const { items, meta } = await service.listCancellations(actorOf(req), query(req));
  sendOk(res, items, meta);
});

cancellationRouter.get('/policy', (_req, res) => {
  sendOk(res, service.defaultPolicy());
});
