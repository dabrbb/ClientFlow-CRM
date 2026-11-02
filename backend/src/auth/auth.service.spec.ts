import {
  ConflictException,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { UsersService } from 'src/users/users.service';
import { AuthService } from './auth.service';
import type { JwtPayload } from './interfaces/jwt-payload.interface';

const CONFIG: Record<string, string> = {
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789',
  JWT_ACCESS_EXPIRES: '15m',
  JWT_REFRESH_EXPIRES: '7d',
};

const PASSWORD = 'correct-password';

type TokenClaims = JwtPayload & { iat: number; exp: number; jti?: string };

// The service stores a hash of the token signature only, so tests compare signatures too.
const signatureOf = (token: string) => token.split('.')[2];

const errorResponseOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpException) return error.getResponse();
    throw error;
  }
  throw new Error('Expected the promise to reject');
};

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let passwordHash: string;
  // Mimics the users table column so that rotation can be tested end to end.
  let storedRefreshHash: string | null;

  const makeUser = (overrides: Partial<User> = {}): User => ({
    id: 1,
    email: 'user@example.com',
    name: 'Test User',
    passwordHash,
    hashedRefreshToken: null,
    role: Role.MANAGER,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  });

  const usersService = {
    getUserByEmail: jest.fn<Promise<User | null>, [string]>(),
    getUserById: jest.fn<Promise<User>, [number]>(),
    createUser: jest.fn<Promise<User>, [Prisma.UserCreateInput]>(),
    updateRefreshToken: jest.fn<Promise<User>, [number, string | null]>(),
  };

  const configService = {
    getOrThrow: jest.fn((key: string) => {
      const value = CONFIG[key];
      if (value === undefined) throw new Error(`Missing config key ${key}`);
      return value;
    }),
  };

  beforeAll(async () => {
    // Cost 4 keeps the prepared user cheap; register() is tested with the real cost 12.
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    storedRefreshHash = null;

    usersService.getUserByEmail.mockResolvedValue(makeUser());
    usersService.getUserById.mockImplementation((id) =>
      Promise.resolve(makeUser({ id, hashedRefreshToken: storedRefreshHash })),
    );
    usersService.updateRefreshToken.mockImplementation((id, hash) => {
      storedRefreshHash = hash;
      return Promise.resolve(makeUser({ id, hashedRefreshToken: hash }));
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        JwtService,
        { provide: UsersService, useValue: usersService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jwtService = moduleRef.get(JwtService);
  });

  describe('register', () => {
    const dto = { name: 'New User', email: 'new@example.com', password: 'a-strong-password' };

    it('rejects an email that is already taken', async () => {
      usersService.getUserByEmail.mockResolvedValue(makeUser({ email: dto.email }));

      await expect(service.register(dto)).rejects.toThrow(ConflictException);

      expect(usersService.createUser).not.toHaveBeenCalled();
      expect(usersService.updateRefreshToken).not.toHaveBeenCalled();
    });

    it('stores a cost-12 bcrypt hash of the password, never the password itself', async () => {
      usersService.getUserByEmail.mockResolvedValue(null);
      usersService.createUser.mockImplementation((data) =>
        Promise.resolve(makeUser({ id: 5, email: data.email, name: data.name })),
      );

      await service.register(dto);

      const [data] = usersService.createUser.mock.calls[0];
      expect(data).toMatchObject({ name: dto.name, email: dto.email });
      expect(data.passwordHash).not.toBe(dto.password);
      expect(data.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      await expect(bcrypt.compare(dto.password, data.passwordHash)).resolves.toBe(true);
    });

    it('returns tokens and a public user without any secret fields', async () => {
      usersService.getUserByEmail.mockResolvedValue(null);
      usersService.createUser.mockResolvedValue(
        makeUser({
          id: 5,
          passwordHash: 'secret-password-hash',
          hashedRefreshToken: 'secret-refresh-hash',
        }),
      );

      const result = await service.register(dto);

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(Object.keys(result.user).sort()).toEqual(['email', 'id', 'name', 'role']);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('secret-password-hash');
      expect(serialized).not.toContain('secret-refresh-hash');
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('hashedRefreshToken');
    });

    it('stores a hash of the new refresh token for the new user', async () => {
      usersService.getUserByEmail.mockResolvedValue(null);
      usersService.createUser.mockResolvedValue(makeUser({ id: 5 }));

      const { refreshToken } = await service.register(dto);

      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(5, expect.any(String));
      await expect(bcrypt.compare(signatureOf(refreshToken), storedRefreshHash!)).resolves.toBe(
        true,
      );
    });
  });

  describe('login', () => {
    const credentials = { email: 'user@example.com', password: PASSWORD };

    it('rejects an unknown email', async () => {
      usersService.getUserByEmail.mockResolvedValue(null);

      await expect(service.login(credentials)).rejects.toThrow(UnauthorizedException);
      expect(usersService.updateRefreshToken).not.toHaveBeenCalled();
    });

    it('rejects a wrong password', async () => {
      await expect(service.login({ ...credentials, password: 'wrong-password' })).rejects.toThrow(
        UnauthorizedException,
      );
      expect(usersService.updateRefreshToken).not.toHaveBeenCalled();
    });

    it('gives the same answer for an unknown email and a wrong password', async () => {
      usersService.getUserByEmail.mockResolvedValueOnce(null);
      const unknownEmail = await errorResponseOf(service.login(credentials));
      const wrongPassword = await errorResponseOf(
        service.login({ ...credentials, password: 'wrong-password' }),
      );

      expect(unknownEmail).toEqual(wrongPassword);
    });

    it('returns both tokens and stores a hash of the refresh token', async () => {
      const tokens = await service.login(credentials);

      expect(tokens.accessToken).toEqual(expect.any(String));
      expect(tokens.refreshToken).toEqual(expect.any(String));
      expect(Object.keys(tokens).sort()).toEqual(['accessToken', 'refreshToken']);
      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(1, expect.any(String));
      expect(storedRefreshHash).not.toBe(tokens.refreshToken);
      await expect(
        bcrypt.compare(signatureOf(tokens.refreshToken), storedRefreshHash!),
      ).resolves.toBe(true);
    });
  });

  describe('issued tokens', () => {
    const credentials = { email: 'user@example.com', password: PASSWORD };

    it('access token carries the user claims, 15 minutes lifetime and no jti', async () => {
      const { accessToken } = await service.login(credentials);

      const claims = await jwtService.verifyAsync<TokenClaims>(accessToken, {
        secret: CONFIG.JWT_ACCESS_SECRET,
      });
      expect(claims).toMatchObject({ sub: 1, email: 'user@example.com', role: Role.MANAGER });
      expect(claims.exp - claims.iat).toBe(15 * 60);
      expect(claims.jti).toBeUndefined();
    });

    it('refresh token has a 7 days lifetime and a unique jti', async () => {
      const first = await service.login(credentials);
      const second = await service.login(credentials);

      const claims = await jwtService.verifyAsync<TokenClaims>(first.refreshToken, {
        secret: CONFIG.JWT_REFRESH_SECRET,
      });
      expect(claims.exp - claims.iat).toBe(7 * 24 * 60 * 60);
      expect(claims.jti).toEqual(expect.any(String));
      expect(first.refreshToken).not.toBe(second.refreshToken);
    });

    it('signs access and refresh tokens with different secrets', async () => {
      const { accessToken, refreshToken } = await service.login(credentials);

      await expect(
        jwtService.verifyAsync(accessToken, { secret: CONFIG.JWT_REFRESH_SECRET }),
      ).rejects.toThrow();
      await expect(
        jwtService.verifyAsync(refreshToken, { secret: CONFIG.JWT_ACCESS_SECRET }),
      ).rejects.toThrow();
    });
  });

  describe('refreshTokens', () => {
    const credentials = { email: 'user@example.com', password: PASSWORD };

    it('is forbidden when the user has no stored refresh token', async () => {
      await expect(service.refreshTokens(1, 'header.payload.signature')).rejects.toThrow(
        ForbiddenException,
      );
      expect(usersService.updateRefreshToken).not.toHaveBeenCalled();
    });

    it('is forbidden for a token that does not match the stored hash', async () => {
      await service.login(credentials);
      const hashAfterLogin = storedRefreshHash;

      await expect(service.refreshTokens(1, 'header.payload.forged-signature')).rejects.toThrow(
        ForbiddenException,
      );
      expect(storedRefreshHash).toBe(hashAfterLogin);
    });

    it('issues a new token pair and replaces the stored hash', async () => {
      const first = await service.login(credentials);
      const hashAfterLogin = storedRefreshHash;

      const second = await service.refreshTokens(1, first.refreshToken);

      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(storedRefreshHash).not.toBe(hashAfterLogin);
      await expect(
        bcrypt.compare(signatureOf(second.refreshToken), storedRefreshHash!),
      ).resolves.toBe(true);
      await expect(
        bcrypt.compare(signatureOf(first.refreshToken), storedRefreshHash!),
      ).resolves.toBe(false);
    });

    it('rotates: an old refresh token cannot be used again', async () => {
      const first = await service.login(credentials);
      const second = await service.refreshTokens(1, first.refreshToken);

      await expect(service.refreshTokens(1, first.refreshToken)).rejects.toThrow(
        ForbiddenException,
      );

      // The newest token keeps working and in turn invalidates the previous one.
      const third = await service.refreshTokens(1, second.refreshToken);
      await expect(service.refreshTokens(1, second.refreshToken)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.refreshTokens(1, third.refreshToken)).resolves.toBeDefined();
    });

    it('stops working after logout', async () => {
      const { refreshToken } = await service.login(credentials);

      await service.logout(1);

      await expect(service.refreshTokens(1, refreshToken)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('logout', () => {
    it('clears the stored refresh token and returns true', async () => {
      await expect(service.logout(7)).resolves.toBe(true);

      expect(usersService.updateRefreshToken).toHaveBeenCalledWith(7, null);
    });
  });
});
