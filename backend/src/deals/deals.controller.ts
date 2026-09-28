import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { DealsService } from './deals.service';
import { UpdateDealDto } from './dto/update-deal.dto';
import { CreateDealDto } from './dto/create-deal.dto';
import { DealResponseDto } from './dto/deal-response.dto';

@Controller('deals')
@UseGuards(JwtAuthGuard)
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Post()
  async create(@Body() dto: CreateDealDto): Promise<DealResponseDto> {
    return this.dealsService.createDeal(
      {
        title: dto.title,
        value: dto.value,
        stage: dto.stage,
        client: {
          connect: {
            id: dto.clientId,
          },
        },
      },
      dto.clientId,
    );
  }

  @Get()
  async findAll(): Promise<DealResponseDto[]> {
    return this.dealsService.getAllDeals();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<DealResponseDto> {
    return this.dealsService.getDealById(id);
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDealDto) {
    return this.dealsService.updateDeal(id, dto);
  }
}
