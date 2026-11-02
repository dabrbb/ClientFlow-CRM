import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { AuthController } from './auth.controller';
import { AuthService, Tokens } from './auth.service';
import type { JwtPayload, JwtRefreshPayload } from './interfaces/jwt-payload.interface';

describe('AuthController', () => {
  let controller: AuthController;

  const tokens: Tokens = { accessToken: 'access', refreshToken: 'refresh' };

  const authService = {
    login: jest.fn<Promise<Tokens>, [{ email: string; password: string }]>(),
    logout: jest.fn<Promise<boolean>, [number]>(),
    refreshTokens: jest.fn<Promise<Tokens>, [number, string]>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  it('login passes the credentials to AuthService and returns its tokens', async () => {
    const dto = { email: 'user@example.com', password: 'secret' };
    authService.login.mockResolvedValue(tokens);

    await expect(controller.login(dto)).resolves.toBe(tokens);

    expect(authService.login).toHaveBeenCalledWith(dto);
  });

  it('logout passes the id of the authenticated user (JWT sub)', async () => {
    const user: JwtPayload = { sub: 7, email: 'user@example.com', role: Role.MANAGER };
    authService.logout.mockResolvedValue(true);

    await expect(controller.logout(user)).resolves.toBe(true);

    expect(authService.logout).toHaveBeenCalledWith(7);
  });

  it('refresh passes the user id and the raw refresh token to AuthService', async () => {
    const user: JwtRefreshPayload = {
      sub: 7,
      email: 'user@example.com',
      role: Role.MANAGER,
      refreshToken: 'raw-refresh-token',
    };
    authService.refreshTokens.mockResolvedValue(tokens);

    await expect(controller.refreshTokens(user)).resolves.toBe(tokens);

    expect(authService.refreshTokens).toHaveBeenCalledWith(7, 'raw-refresh-token');
  });
});
