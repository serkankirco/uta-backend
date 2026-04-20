import {
  Controller, Get, Patch, Post, Body, Param, Query,
  UseGuards, ParseUUIDPipe, DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { OrdersService } from './orders.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OpenDisputeDto } from './dto/open-dispute.dto';
import { CreateRatingDto } from './dto/create-rating.dto';

@ApiTags('Orders')
@Controller({ path: 'orders', version: '1' })
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'Siparişlerim' })
  @ApiQuery({ name: 'role', enum: ['buyer', 'supplier', 'all'], required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('role') role: 'buyer' | 'supplier' | 'all' = 'all',
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.ordersService.findAll(user.sub, role, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Sipariş detayı' })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.findOne(user.sub, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Sipariş durumunu güncelle' })
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(user.sub, id, dto);
  }

  @Post(':id/dispute')
  @ApiOperation({ summary: 'Siparişe itiraz aç' })
  openDispute(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OpenDisputeDto,
  ) {
    return this.ordersService.openDispute(user.sub, id, dto);
  }

  @Post(':id/rating')
  @ApiOperation({ summary: 'Sipariş değerlendirmesi bırak' })
  createRating(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRatingDto,
  ) {
    return this.ordersService.createRating(user.sub, id, dto);
  }
}
