import { Injectable } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { Prisma, User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async getUserByEmail(email: string): Promise<User | null> {
    const user = await this.usersRepository.findByEmail(email);
    return user;
  }

  async getUserById(id: number): Promise<User | null> {
    const user = await this.usersRepository.findById(id);
    return user;
  }

  async createUser(data: Prisma.UserCreateInput): Promise<User> {
    const user = await this.usersRepository.create(data);
    return user;
  }

  async updateRefreshToken(userId: number, hashedRefreshToken: string | null): Promise<User> {
    return this.usersRepository.updateRefreshToken(userId, hashedRefreshToken);
  }
}
