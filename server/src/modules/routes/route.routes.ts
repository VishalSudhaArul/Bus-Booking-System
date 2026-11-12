import { Router } from 'express';
import { actorOf, authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { idParams, query, sendCreated, sendOk } from '../../utils/http';
import * as service from './route.service';

export const routeRouter = Router();

routeRouter.get('/popular', async (_req, res) => {
  sendOk(res, await service.popularRoutes());
});

routeRouter.use(authenticate);

routeRouter.get('/', authorize('ADMIN', 'OPERATOR'), validate({ query: service.listRoutesQuery }), async (req, res) => {
  const { items, meta } = await service.listRoutes(actorOf(req), query(req));
  sendOk(res, items, meta);
});

routeRouter.get('/:id', authorize('ADMIN', 'OPERATOR'), validate({ params: idParams }), async (req, res) => {
  sendOk(res, await service.getRoute(actorOf(req), String(req.params.id)));
});

routeRouter.post('/', authorize('ADMIN'), validate({ body: service.createRouteSchema }), async (req, res) => {
  sendCreated(res, await service.createRoute(actorOf(req), req.body));
});

routeRouter.patch('/:id', authorize('ADMIN'), validate({ params: idParams, body: service.updateRouteSchema }), async (req, res) => {
  sendOk(res, await service.updateRoute(actorOf(req), String(req.params.id), req.body));
});
