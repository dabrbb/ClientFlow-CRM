import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import type { JwtPayload } from 'src/auth/interfaces/jwt-payload.interface';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { DealsService } from './deals.service';
import { UpdateDealDto } from './dto/update-deal.dto';
import { CreateDealDto } from './dto/create-deal.dto';
import { DealResponseDto } from './dto/deal-response.dto';

@Controller('deals')
@UseGuards(JwtAuthGuard)
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Post()
  async create(
    @Body() dto: CreateDealDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<DealResponseDto> {
    return this.dealsService.createDeal(dto, user);
  }

  @Get()
  async findAll(@CurrentUser() user: JwtPayload): Promise<DealResponseDto[]> {
    return this.dealsService.getAllDeals(user);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<DealResponseDto> {
    return this.dealsService.getDealForActor(id, user);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDealDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.dealsService.updateDeal(id, dto, user);
  }
}
