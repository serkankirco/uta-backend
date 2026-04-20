import {
  Controller, Get, Post, Patch, Body, Param,
  UseGuards, ParseUUIDPipe, DefaultValuePipe, ParseIntPipe, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { BidsService } from './bids.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { CounterOfferDto } from './dto/counter-offer.dto';

@ApiTags('Bids')
@Controller({ path: 'bids', version: '1' })
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class BidsController {
  constructor(private readonly bidsService: BidsService) {}

  // POST /api/v1/posts/:postId/bids  → teklif ver (posts altında nested route)
  // Ama ayrıca /bids altında da kendi endpoint'lerimiz var

  @Get('me')
  @ApiOperation({ summary: 'Verdiğim teklifler' })
  findMyBids(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.bidsService.findMyBids(user.sub, page, limit);
  }

  @Post('post/:postId')
  @ApiOperation({ summary: 'İlana teklif ver' })
  create(
    @CurrentUser() user: JwtPayload,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body() dto: CreateBidDto,
  ) {
    return this.bidsService.create(user.sub, postId, dto);
  }

  @Get('post/:postId')
  @ApiOperation({ summary: 'İlanın teklifleri (ilan sahibi)' })
  findByPost(
    @CurrentUser() user: JwtPayload,
    @Param('postId', ParseUUIDPipe) postId: string,
  ) {
    return this.bidsService.findByPost(user.sub, postId);
  }

  @Post(':id/counter-offer')
  @ApiOperation({ summary: 'Karşı teklif sun' })
  counterOffer(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CounterOfferDto,
  ) {
    return this.bidsService.counterOffer(user.sub, id, dto);
  }

  @Patch(':id/accept')
  @ApiOperation({ summary: 'Teklifi kabul et → Sipariş oluşturur' })
  accept(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.bidsService.accept(user.sub, id);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Teklifi reddet' })
  reject(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.bidsService.reject(user.sub, id);
  }

  @Patch(':id/withdraw')
  @ApiOperation({ summary: 'Teklifimi geri çek' })
  withdraw(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.bidsService.withdraw(user.sub, id);
  }
}
