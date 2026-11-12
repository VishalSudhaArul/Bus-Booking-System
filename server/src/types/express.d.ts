import type { Role } from './domain';

declare global {
  namespace Express {
    interface AuthUser {
      id: string;
      role: Role;
      operatorId?: string;
    }
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}

export {};
