import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env';
import { actorOf } from '../../middleware/auth';
import { sendCreated, sendOk } from '../../utils/http';
import * as authService from './auth.service';

export const REFRESH_COOKIE = 'bn_refresh';

// The refresh token lives in an httpOnly cookie scoped to the auth routes, so
// page scripts can never read it and it is not sent with ordinary API calls.
const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE || env.COOKIE_SAMESITE === 'none',
  sameSite: env.COOKIE_SAMESITE,
  path: '/api/v1/auth',
});

const metaOf = (req: Request): authService.SessionMeta => ({ userAgent: req.headers['user-agent'], ip: req.ip });

function respondWithSession(res: Response, result: authService.AuthResult, status: 200 | 201) {
  res.cookie(REFRESH_COOKIE, result.refreshToken, { ...cookieOptions(), expires: result.refreshExpiresAt });
  const payload = { user: result.user, accessToken: result.accessToken };
  return status === 201 ? sendCreated(res, payload) : sendOk(res, payload);
}

export async function register(req: Request, res: Response) {
  respondWithSession(res, await authService.register(req.body, metaOf(req)), 201);
}

export async function login(req: Request, res: Response) {
  respondWithSession(res, await authService.login(req.body, metaOf(req)), 200);
}

export async function refresh(req: Request, res: Response) {
  try {
    respondWithSession(res, await authService.refreshSession(req.cookies?.[REFRESH_COOKIE], metaOf(req)), 200);
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
  sendOk(res, { loggedOut: true });
}

export async function me(req: Request, res: Response) {
  sendOk(res, await authService.getProfile(actorOf(req).id));
}

export async function updateMe(req: Request, res: Response) {
  sendOk(res, await authService.updateProfile(actorOf(req).id, req.body));
}

export async function changePassword(req: Request, res: Response) {
  await authService.changePassword(actorOf(req).id, req.body.currentPassword, req.body.newPassword);
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
  sendOk(res, { passwordChanged: true });
}
