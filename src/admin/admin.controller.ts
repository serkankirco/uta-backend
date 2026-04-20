import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, ParseUUIDPipe, DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { ReviewCompanyDto } from './dto/review-company.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { CreateSectorDto } from './dto/create-sector.dto';
import { CompanyStatus, DisputeStatus } from '@prisma/client';

@ApiTags('Admin')
@Controller({ path: 'admin', version: '1' })
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth('access-token')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Dashboard
  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard istatistikleri' })
  getDashboard() {
    return this.adminService.getDashboardStats();
  }

  // ── Şirketler
  @Get('companies/pending')
  @ApiOperation({ summary: 'Onay bekleyen şirketler' })
  getPending(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.getPendingCompanies(page, limit);
  }

  @Get('companies')
  @ApiOperation({ summary: 'Tüm şirketler' })
  @ApiQuery({ name: 'status', enum: CompanyStatus, required: false })
  @ApiQuery({ name: 'search', required: false })
  getAllCompanies(
    @Query('status') status?: CompanyStatus,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.adminService.getAllCompanies({ status, search, page, limit });
  }

  @Patch('companies/:id/review')
  @ApiOperation({ summary: 'Şirketi onayla veya reddet' })
  reviewCompany(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewCompanyDto,
  ) {
    return this.adminService.reviewCompany(user.sub, id, dto);
  }

  @Patch('companies/:id/suspend')
  @ApiOperation({ summary: 'Şirketi askıya al' })
  suspendCompany(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
  ) {
    return this.adminService.suspendCompany(user.sub, id, reason);
  }

  // ── İtirazlar
  @Get('disputes')
  @ApiOperation({ summary: 'İtiraz listesi' })
  @ApiQuery({ name: 'status', enum: DisputeStatus, required: false })
  getDisputes(
    @Query('status') status?: DisputeStatus,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.adminService.getDisputes(status, page, limit);
  }

  @Patch('disputes/:id/resolve')
  @ApiOperation({ summary: 'İtirazı çöz' })
  resolveDispute(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.adminService.resolveDispute(user.sub, id, dto);
  }

  // ── Audit log
  @Get('audit-logs')
  @ApiOperation({ summary: 'Denetim kayıtları' })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'entityId', required: false })
  getAuditLogs(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.adminService.getAuditLogs({ entityType, entityId, page, limit });
  }

  // ── Sektörler
  @Get('sectors')
  @ApiOperation({ summary: 'Sektör listesi' })
  getSectors() {
    return this.adminService.getSectors();
  }

  @Post('sectors')
  @ApiOperation({ summary: 'Yeni sektör ekle' })
  createSector(@Body() dto: CreateSectorDto) {
    return this.adminService.createSector(dto);
  }

  @Patch('sectors/:id/toggle')
  @ApiOperation({ summary: 'Sektörü aktif/pasif yap' })
  toggleSector(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.toggleSector(id);
  }

  // ── Üyelik planları
  @Get('membership-plans')
  @ApiOperation({ summary: 'Üyelik planları' })
  getMembershipPlans() {
    return this.adminService.getMembershipPlans();
  }
}
