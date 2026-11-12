import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { forbidden, unauthorized } from '../utils/errors';
import type { Actor, Role } from '../types/domain';
import { ROLES } from '../types/domain';

export const JWT_ISSUER = 'busnest-api';
export const JWT_AUDIENCE = 'busnest-client';

interface AccessPayload {
  sub: string;
  role: Role;
  operatorId?: string;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign({ role: payload.role, operatorId: payload.operatorId }, env.JWT_SECRET, {
    subject: payload.sub,
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithm: 'HS256',
  });
}

function readBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

function verify(token: string): Express.AuthUser {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    if (!decoded.sub || !ROLES.includes(decoded.role)) throw unauthorized('Invalid access token', 'TOKEN_INVALID');
    return { id: decoded.sub, role: decoded.role, operatorId: decoded.operatorId };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw unauthorized('Access token expired', 'TOKEN_EXPIRED');
    throw unauthorized('Invalid access token', 'TOKEN_INVALID');
  }
}

/** Requires a valid access token. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = readBearer(req);
  if (!token) throw unauthorized();
  req.user = verify(token);
  next();
}

/** Role gate — always enforced on the server, regardless of what the UI shows. */
export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    if (req.user.role === 'OPERATOR' && !req.user.operatorId) {
      throw forbidden('This operator account is not linked to an operator', 'OPERATOR_NOT_LINKED');
    }
    next();
  };
}

export function actorOf(req: Request): Actor {
  if (!req.user) throw unauthorized();
  return { ...req.user, ip: req.ip };
}

/**
 * Mongo filter fragment that limits a query to the caller's operator.
 * Admins are unrestricted; operators only ever see their own operator's data.
 */
export function operatorScope(actor: Actor, field = 'operatorId'): Record<string, unknown> {
  if (actor.role === 'ADMIN') return {};
  if (actor.role === 'OPERATOR' && actor.operatorId) return { [field]: actor.operatorId };
  throw forbidden();
}

/** Throws unless the actor may act on a resource owned by `operatorId`. */
export function assertOperatorAccess(actor: Actor, operatorId: unknown) {
  if (actor.role === 'ADMIN') return;
  if (actor.role === 'OPERATOR' && actor.operatorId && String(operatorId) === actor.operatorId) return;
  throw forbidden();
}
