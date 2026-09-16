import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { UpdateClientDto } from './dto/update-client.dto';
import { GetClientsQueryDto } from './dto/get-clients-query.dto';
import { ClientResponseDto } from './dto/clients-response.dto';

@Controller('clients')
@UseGuards(JwtAuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  async create(@Body() dto: CreateClientDto, @CurrentUser() user: JwtPayload) {
    return this.clientsService.createClient({
      ...dto,
      user: {
        connect: {
          id: user.sub,
        },
      },
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clientsService.getClientById(id);
  }

  @Get()
  async findAll(@Query() query: GetClientsQueryDto): Promise<ClientResponseDto> {
    return this.clientsService.getAllClients(query);
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClientDto) {
    return this.clientsService.updateClient(id, dto);
  }
}
