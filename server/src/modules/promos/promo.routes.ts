import { Router } from 'express';
import { sendOk } from '../../utils/http';
import { listPromos } from './promo.service';

export const promoRouter = Router();

// Public: offers shown at checkout. Discounts are only ever applied server-side.
promoRouter.get('/', (_req, res) => {
  sendOk(res, listPromos());
});
