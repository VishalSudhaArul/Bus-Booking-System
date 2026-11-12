import type { Request, Response } from 'express';
import { actorOf } from '../../middleware/auth';
import { query, sendCreated, sendOk } from '../../utils/http';
import * as service from './trip.service';
import type { ListTripsQuery, SearchTripsQuery } from './trip.validation';

export async function search(req: Request, res: Response) {
  const { items, meta, facets } = await service.searchTrips(query<SearchTripsQuery>(req));
  sendOk(res, items, { ...meta, facets });
}

export async function details(req: Request, res: Response) {
  sendOk(res, await service.getTripDetails(String(req.params.id)));
}

export async function seats(req: Request, res: Response) {
  // Availability changes by the second; never let a proxy or browser cache it.
  res.setHeader('Cache-Control', 'no-store');
  sendOk(res, await service.getTripSeats(String(req.params.id)));
}

export async function list(req: Request, res: Response) {
  const { items, meta } = await service.listTrips(actorOf(req), query<ListTripsQuery>(req));
  sendOk(res, items, meta);
}

export async function create(req: Request, res: Response) {
  sendCreated(res, await service.createTrips(actorOf(req), req.body));
}

export async function update(req: Request, res: Response) {
  sendOk(res, await service.updateTrip(actorOf(req), String(req.params.id), req.body));
}

export async function manifest(req: Request, res: Response) {
  sendOk(res, await service.getManifest(actorOf(req), String(req.params.id)));
}
