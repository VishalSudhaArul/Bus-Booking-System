import { Router } from 'express';
import { actorOf, authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { query, sendOk } from '../../utils/http';
import * as service from './report.service';

export const reportRouter = Router();

reportRouter.use(authenticate, authorize('ADMIN', 'OPERATOR'));

reportRouter.get('/dashboard', async (req, res) => {
  sendOk(res, await service.getDashboard(actorOf(req)));
});

reportRouter.get('/occupancy', validate({ query: service.occupancyQuery }), async (req, res) => {
  const { items, meta, summary } = await service.getOccupancyReport(actorOf(req), query(req));
  sendOk(res, items, { ...meta, summary });
});

reportRouter.get('/bookings', validate({ query: service.rangeQuery }), async (req, res) => {
  sendOk(res, await service.getBookingSummary(actorOf(req), query(req)));
});
