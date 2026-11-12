import { Router } from 'express';
import { actorOf, authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { idParams, query, sendCreated, sendOk } from '../../utils/http';
import * as service from './bus.service';

export const busRouter = Router();

busRouter.use(authenticate);

busRouter.get('/', authorize('ADMIN', 'OPERATOR'), validate({ query: service.listBusesQuery }), async (req, res) => {
  const { items, meta } = await service.listBuses(actorOf(req), query(req));
  sendOk(res, items, meta);
});

busRouter.get('/:id', authorize('ADMIN', 'OPERATOR'), validate({ params: idParams }), async (req, res) => {
  sendOk(res, await service.getBus(actorOf(req), String(req.params.id)));
});

busRouter.post('/', authorize('ADMIN'), validate({ body: service.createBusSchema }), async (req, res) => {
  sendCreated(res, await service.createBus(actorOf(req), req.body));
});

busRouter.patch('/:id', authorize('ADMIN'), validate({ params: idParams, body: service.updateBusSchema }), async (req, res) => {
  sendOk(res, await service.updateBus(actorOf(req), String(req.params.id), req.body));
});

busRouter.patch(
  '/:id/seats/:seatId',
  authorize('ADMIN'),
  validate({ params: service.seatParams, body: service.updateSeatSchema }),
  async (req, res) => {
    sendOk(res, await service.updateSeat(actorOf(req), String(req.params.id), String(req.params.seatId), req.body));
  },
);
