import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { UsersService } from 'src/users/users.service';
import * as bcrypt from 'bcryptjs';
import { Role, User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { StringValue } from 'ms';
import { LoginDto } from './dto/login.dto';
import { randomUUID } from 'node:crypto';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(userDto: LoginDto): Promise<Tokens> {
    const user = await this.validateUser(userDto);

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    return tokens;
  }

  async register(userDto: RegisterDto) {
    const candidate = await this.usersService.getUserByEmail(userDto.email);

    if (candidate) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(userDto.password, 12);

    const { name, email } = userDto;
    const user = await this.usersService.createUser({
      name,
      email,
      passwordHash,
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async logout(userId: number): Promise<boolean> {
    await this.usersService.updateRefreshToken(userId, null);
    return true;
  }

  private async generateTokens(userId: number, email: string, role: Role): Promise<Tokens> {
    const accessPayload = {
      sub: userId,
      email,
      role,
    };

    const refreshPayload = {
      sub: userId,
      email,
      role,
      jti: randomUUID(),
    };

    const accessTokenOptions: JwtSignOptions = {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<StringValue>('JWT_ACCESS_EXPIRATION', '15m'),
    };

    const refreshTokenOptions: JwtSignOptions = {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get<StringValue>('JWT_REFRESH_EXPIRATION', '7d'),
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, accessTokenOptions),
      this.jwtService.signAsync(refreshPayload, refreshTokenOptions),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  private async updateRefreshTokenHash(userId: number, refreshToken: string): Promise<void> {
    const hash = await bcrypt.hash(refreshToken.split('.')[2], 10);
    await this.usersService.updateRefreshToken(userId, hash);
  }

  async refreshTokens(userId: number, refreshToken: string): Promise<Tokens> {
    const user = await this.usersService.getUserById(userId);
    if (!user.hashedRefreshToken) {
      throw new ForbiddenException('Access denied');
    }

    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken.split('.')[2],
      user.hashedRefreshToken,
    );

    if (!isRefreshTokenValid) {
      throw new ForbiddenException('Access denied');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);
    return tokens;
  }

  private async validateUser(userDto: LoginDto): Promise<User> {
    const user = await this.usersService.getUserByEmail(userDto.email);

    if (!user) {
      throw new UnauthorizedException({
        message: 'Your email or password is incorrect',
      });
    }

    const passwordEquals = await bcrypt.compare(userDto.password, user.passwordHash);

    if (!passwordEquals) {
      throw new UnauthorizedException({
        message: 'Your email or password is incorrect',
      });
    }

    return user;
  }
}
