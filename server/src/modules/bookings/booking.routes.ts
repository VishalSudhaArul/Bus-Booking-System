import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { bookingLimiter } from '../../middleware/security';
import { validate } from '../../middleware/validate';
import { idParams } from '../../utils/http';
import * as controller from './booking.controller';
import { cancelBookingSchema, createBookingSchema, listBookingsQuery, myBookingsQuery, pnrParams, quoteSchema } from './booking.validation';

export const bookingRouter = Router();

bookingRouter.use(authenticate);

bookingRouter.post('/', authorize('PASSENGER'), bookingLimiter, validate({ body: createBookingSchema }), controller.create);
bookingRouter.post('/quote', authorize('PASSENGER'), bookingLimiter, validate({ body: quoteSchema }), controller.quote);
bookingRouter.get('/me', authorize('PASSENGER'), validate({ query: myBookingsQuery }), controller.mine);
bookingRouter.get('/', authorize('ADMIN', 'OPERATOR'), validate({ query: listBookingsQuery }), controller.list);
bookingRouter.get('/pnr/:pnr', validate({ params: pnrParams }), controller.getByPnr);

// Ownership / operator scope is verified inside the service for these.
bookingRouter.get('/:id', validate({ params: idParams }), controller.getOne);
bookingRouter.get('/:id/cancellation-quote', authorize('PASSENGER', 'ADMIN'), validate({ params: idParams }), controller.cancellationQuote);
bookingRouter.post(
  '/:id/cancel',
  authorize('PASSENGER', 'ADMIN'),
  bookingLimiter,
  validate({ params: idParams, body: cancelBookingSchema }),
  controller.cancel,
);
