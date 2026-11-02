import type { Request } from 'express';
import type { JwtPayload } from './jwt-payload.interface';

export interface AuthenticatedRequest<TUser extends JwtPayload = JwtPayload> extends Request {
  user: TUser;
}
