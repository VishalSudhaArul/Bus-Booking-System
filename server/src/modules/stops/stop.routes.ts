import { Router } from 'express';
import { actorOf, authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { idParams, query, sendCreated, sendOk } from '../../utils/http';
import * as service from './stop.service';

export const stopRouter = Router();

stopRouter.get('/cities', async (_req, res) => {
  sendOk(res, await service.listCities());
});

stopRouter.get('/', validate({ query: service.listStopsQuery }), async (req, res) => {
  const { items, meta } = await service.listStops(query(req));
  sendOk(res, items, meta);
});

stopRouter.post('/', authenticate, authorize('ADMIN'), validate({ body: service.createStopSchema }), async (req, res) => {
  sendCreated(res, await service.createStop(actorOf(req), req.body));
});

stopRouter.patch(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  validate({ params: idParams, body: service.updateStopSchema }),
  async (req, res) => {
    sendOk(res, await service.updateStop(actorOf(req), String(req.params.id), req.body));
  },
);
