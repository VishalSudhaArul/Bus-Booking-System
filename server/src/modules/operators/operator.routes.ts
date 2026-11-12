import { Router } from 'express';
import { actorOf, authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { idParams, query, sendCreated, sendOk } from '../../utils/http';
import * as service from './operator.service';

export const operatorRouter = Router();

// Public: active operators only, limited fields (landing page).
operatorRouter.get('/public', validate({ query: service.listOperatorsQuery }), async (req, res) => {
  const { items, meta } = await service.listOperators(query(req), true);
  sendOk(res, items, meta);
});

operatorRouter.get('/', authenticate, authorize('ADMIN'), validate({ query: service.listOperatorsQuery }), async (req, res) => {
  const { items, meta } = await service.listOperators(query(req), false);
  sendOk(res, items, meta);
});

operatorRouter.post('/', authenticate, authorize('ADMIN'), validate({ body: service.createOperatorSchema }), async (req, res) => {
  sendCreated(res, await service.createOperator(actorOf(req), req.body));
});

operatorRouter.patch(
  '/:id',
  authenticate,
  authorize('ADMIN'),
  validate({ params: idParams, body: service.updateOperatorSchema }),
  async (req, res) => {
    sendOk(res, await service.updateOperator(actorOf(req), String(req.params.id), req.body));
  },
);
