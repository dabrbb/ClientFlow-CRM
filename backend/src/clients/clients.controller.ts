import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UpdateClientDto } from './dto/update-client.dto';
import { GetClientsQueryDto } from './dto/get-clients-query.dto';
import { ClientResponseDto } from './dto/clients-response.dto';
import { GetPoolQueryDto } from './dto/get-pool-query.dto';
import { PoolResponseDto } from './dto/pool-response.dto';
import { AddManagerDto } from './dto/add-manager.dto';
import { ClientManagerResponseDto } from './dto/client-manager-response.dto';

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  // Only an admin creates clients; a new client waits in the pool until a manager takes it.
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async create(@Body() dto: CreateClientDto, @CurrentUser() user: JwtPayload) {
    return this.clientsService.createClient(dto, user);
  }

  // Declared before ':id' so the word "pool" is not parsed as a client id.
  @Get('pool')
  async findPool(@Query() query: GetPoolQueryDto): Promise<PoolResponseDto> {
    return this.clientsService.getPool(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.clientsService.getClientForActor(id, user);
  }

  @Get()
  async findAll(
    @Query() query: GetClientsQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ClientResponseDto> {
    return this.clientsService.getAllClients(query, user);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.clientsService.updateClient(id, dto, user);
  }

  @Post(':id/claim')
  async claim(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.clientsService.claimClient(id, user);
  }

  @Get(':id/managers')
  async findManagers(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<ClientManagerResponseDto[]> {
    return this.clientsService.getManagers(id, user);
  }

  @Post(':id/managers')
  async addManager(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddManagerDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ClientManagerResponseDto> {
    return this.clientsService.addManager(id, dto.userId, user);
  }

  @Delete(':id/managers/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeManager(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.clientsService.removeManager(id, userId, user);
  }
}
