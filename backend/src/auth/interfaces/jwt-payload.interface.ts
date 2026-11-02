import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
}

export interface JwtRefreshPayload extends JwtPayload {
  refreshToken: string;
}
