import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authLimiter } from '../../middleware/security';
import { validate } from '../../middleware/validate';
import * as controller from './auth.controller';
import { changePasswordSchema, loginSchema, registerSchema, updateProfileSchema } from './auth.validation';

export const authRouter = Router();

authRouter.post('/register', authLimiter, validate({ body: registerSchema }), controller.register);
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);
authRouter.post('/refresh', authLimiter, controller.refresh);
authRouter.post('/logout', controller.logout);
authRouter.get('/me', authenticate, controller.me);
authRouter.patch('/me', authenticate, validate({ body: updateProfileSchema }), controller.updateMe);
authRouter.patch('/me/password', authenticate, authLimiter, validate({ body: changePasswordSchema }), controller.changePassword);
