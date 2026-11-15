import type { Request, Response } from 'express';
import { actorOf } from '../../middleware/auth';
import { query, sendOk } from '../../utils/http';
import * as cancellationService from '../cancellations/cancellation.service';
import * as service from './booking.service';
import { idempotencyKeySchema } from './booking.validation';

export async function create(req: Request, res: Response) {
  const key = idempotencyKeySchema.parse(req.header('Idempotency-Key'));
  const { booking, replayed } = await service.createBooking(actorOf(req), req.body, key);
  if (replayed) res.setHeader('Idempotent-Replayed', 'true');
  // 201 the first time, 200 when an earlier identical request is replayed.
  res.status(replayed ? 200 : 201).json({ success: true, data: booking });
}

export async function quote(req: Request, res: Response) {
  sendOk(res, await service.quoteFare(req.body));
}

export async function mine(req: Request, res: Response) {
  const { items, meta } = await service.listMyBookings(actorOf(req), query(req));
  sendOk(res, items, meta);
}

export async function list(req: Request, res: Response) {
  const { items, meta } = await service.listBookings(actorOf(req), query(req));
  sendOk(res, items, meta);
}

export async function getOne(req: Request, res: Response) {
  sendOk(res, await service.getBookingDetails(actorOf(req), String(req.params.id)));
}

export async function getByPnr(req: Request, res: Response) {
  sendOk(res, await service.getBookingByPnr(actorOf(req), String(req.params.pnr)));
}

export async function cancellationQuote(req: Request, res: Response) {
  sendOk(res, await cancellationService.getCancellationQuote(actorOf(req), String(req.params.id)));
}

export async function cancel(req: Request, res: Response) {
  const actor = actorOf(req);
  const cancellation = await cancellationService.cancelBooking(actor, String(req.params.id), req.body.reason);
  sendOk(res, { cancellation, booking: await service.getBookingDetails(actor, String(req.params.id)) });
}
