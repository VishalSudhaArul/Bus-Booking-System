import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { idParams } from '../../utils/http';
import * as controller from './trip.controller';
import { createTripSchema, listTripsQuery, searchTripsQuery, updateTripSchema } from './trip.validation';

export const tripRouter = Router();

const staff = [authenticate, authorize('ADMIN', 'OPERATOR')];

// Public passenger endpoints
tripRouter.get('/search', validate({ query: searchTripsQuery }), controller.search);

// Management list (declared before "/:id" so it is not captured as an id)
tripRouter.get('/', ...staff, validate({ query: listTripsQuery }), controller.list);
tripRouter.post('/', ...staff, validate({ body: createTripSchema }), controller.create);

tripRouter.get('/:id', validate({ params: idParams }), controller.details);
tripRouter.get('/:id/seats', validate({ params: idParams }), controller.seats);
tripRouter.get('/:id/manifest', ...staff, validate({ params: idParams }), controller.manifest);
tripRouter.patch('/:id', ...staff, validate({ params: idParams, body: updateTripSchema }), controller.update);
