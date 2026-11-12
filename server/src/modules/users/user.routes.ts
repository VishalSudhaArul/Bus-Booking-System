import { Router } from 'express';
import { actorOf, authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { idParams, query, sendCreated, sendOk } from '../../utils/http';
import * as service from './user.service';

export const userRouter = Router();

userRouter.use(authenticate, authorize('ADMIN'));

userRouter.get('/', validate({ query: service.listUsersQuery }), async (req, res) => {
  const { items, meta } = await service.listUsers(query(req));
  sendOk(res, items, meta);
});

userRouter.post('/', validate({ body: service.createUserSchema }), async (req, res) => {
  sendCreated(res, await service.createUser(actorOf(req), req.body));
});

userRouter.patch('/:id', validate({ params: idParams, body: service.updateUserSchema }), async (req, res) => {
  sendOk(res, await service.updateUser(actorOf(req), String(req.params.id), req.body));
});
