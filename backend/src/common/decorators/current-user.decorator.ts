import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from 'src/auth/interfaces/authenticated-request.interface';
import type { JwtPayload, JwtRefreshPayload } from 'src/auth/interfaces/jwt-payload.interface';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

// Only valid behind RefreshTokenGuard: its strategy adds refreshToken to the user object.
export const CurrentRefreshUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtRefreshPayload =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest<JwtRefreshPayload>>().user,
);
