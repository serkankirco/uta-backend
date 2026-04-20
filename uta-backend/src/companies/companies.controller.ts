import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, ParseUUIDPipe, DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@ApiTags('Companies')
@Controller({ path: 'companies', version: '1' })
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Şirket profili oluştur' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCompanyDto) {
    return this.companiesService.create(user.sub, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Kendi şirket profilim' })
  getMyCompany(@CurrentUser() user: JwtPayload) {
    return this.companiesService.getMyCompany(user.sub);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Şirket profilini güncelle' })
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Onaylı şirketleri listele' })
  @ApiQuery({ name: 'sector', required: false })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('sector') sector?: string,
    @Query('city') city?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.companiesService.findAll({ sector, city, search, page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Şirket detayı' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.companiesService.findOne(id);
  }

  @Get(':id/ratings')
  @ApiOperation({ summary: 'Şirket değerlendirmeleri' })
  getRatings(@Param('id', ParseUUIDPipe) id: string) {
    return this.companiesService.getRatingSummary(id);
  }
}
