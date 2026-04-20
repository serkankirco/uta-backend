import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CompanyStatus, DisputeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReviewCompanyDto } from './dto/review-company.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { CreateSectorDto } from './dto/create-sector.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Dashboard istatistikleri
  async getDashboardStats() {
    const [
      totalCompanies,
      pendingCompanies,
      totalPosts,
      activePosts,
      totalOrders,
      openDisputes,
      totalUsers,
    ] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.company.count({ where: { status: CompanyStatus.PENDING } }),
      this.prisma.post.count(),
      this.prisma.post.count({ where: { status: 'ACTIVE' } }),
      this.prisma.order.count(),
      this.prisma.dispute.count({ where: { status: DisputeStatus.OPEN } }),
      this.prisma.user.count(),
    ]);

    // Son 30 gün kayıt trendi
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSignups = await this.prisma.company.count({
      where: { createdAt: { gte: thirtyDaysAgo } },
    });

    return {
      companies: { total: totalCompanies, pending: pendingCompanies, recentSignups },
      posts: { total: totalPosts, active: activePosts },
      orders: { total: totalOrders },
      disputes: { open: openDisputes },
      users: { total: totalUsers },
    };
  }

  // ── Onay bekleyen şirketler
  async getPendingCompanies(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [companies, total] = await Promise.all([
      this.prisma.company.findMany({
        where: { status: CompanyStatus.PENDING },
        include: {
          user: { select: { email: true, firstName: true, lastName: true } },
          documents: true,
        },
        orderBy: { createdAt: 'asc' }, // En eski önce
        skip,
        take: limit,
      }),
      this.prisma.company.count({ where: { status: CompanyStatus.PENDING } }),
    ]);
    return { data: companies, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Tüm şirketler
  async getAllCompanies(params: { status?: CompanyStatus; search?: string; page?: number; limit?: number }) {
    const { status, search, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { taxNumber: { contains: search } },
      ];
    }

    const [companies, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.company.count({ where }),
    ]);

    return { data: companies, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Şirket onayla / reddet
  async reviewCompany(adminUserId: string, companyId: string, dto: ReviewCompanyDto) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { user: true },
    });
    if (!company) throw new NotFoundException('Şirket bulunamadı');

    if (company.status !== CompanyStatus.PENDING) {
      throw new BadRequestException(`Şirket zaten "${company.status}" durumunda`);
    }

    const newStatus = dto.approved ? CompanyStatus.APPROVED : CompanyStatus.REJECTED;

    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        status: newStatus,
        approvedAt: dto.approved ? new Date() : null,
        approvedBy: dto.approved ? adminUserId : null,
        rejectionNote: dto.approved ? null : dto.rejectionNote,
      },
    });

    // Şirket sahibine bildirim
    await this.notifications.create({
      userId: company.userId,
      type: dto.approved ? 'COMPANY_APPROVED' : 'COMPANY_REJECTED',
      title: dto.approved ? 'Şirketiniz Onaylandı! 🎉' : 'Şirket Başvurunuz Reddedildi',
      body: dto.approved
        ? `${company.name} şirketi onaylandı. Artık ilan oluşturabilir ve teklif verebilirsiniz.`
        : `Başvurunuz reddedildi. Sebep: ${dto.rejectionNote}`,
      data: { companyId },
    });

    // Audit log
    await this.logAudit({
      userId: adminUserId,
      action: dto.approved ? 'COMPANY_APPROVED' : 'COMPANY_REJECTED',
      entityType: 'Company',
      entityId: companyId,
      metadata: { rejectionNote: dto.rejectionNote },
    });

    return { message: dto.approved ? 'Şirket onaylandı' : 'Şirket reddedildi' };
  }

  // ── Şirketi askıya al
  async suspendCompany(adminUserId: string, companyId: string, reason: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Şirket bulunamadı');

    await this.prisma.company.update({
      where: { id: companyId },
      data: { status: CompanyStatus.SUSPENDED },
    });

    await this.logAudit({
      userId: adminUserId,
      action: 'COMPANY_SUSPENDED',
      entityType: 'Company',
      entityId: companyId,
      metadata: { reason },
    });

    return { message: 'Şirket askıya alındı' };
  }

  // ── Açık itirazlar
  async getDisputes(status?: DisputeStatus, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [disputes, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        include: {
          order: {
            include: {
              buyerCompany: { select: { name: true } },
              supplierCompany: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.dispute.count({ where }),
    ]);

    return { data: disputes, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── İtirazı çöz
  async resolveDispute(adminUserId: string, disputeId: string, dto: ResolveDisputeDto) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { order: { include: { buyerCompany: { include: { user: true } }, supplierCompany: { include: { user: true } } } } },
    });
    if (!dispute) throw new NotFoundException('İtiraz bulunamadı');
    if (dispute.status === DisputeStatus.RESOLVED || dispute.status === DisputeStatus.CLOSED) {
      throw new BadRequestException('Bu itiraz zaten çözüme kavuşturulmuş');
    }

    await this.prisma.$transaction([
      this.prisma.dispute.update({
        where: { id: disputeId },
        data: {
          status: DisputeStatus.RESOLVED,
          resolution: dto.resolution,
          resolvedBy: adminUserId,
          resolvedAt: new Date(),
        },
      }),
      this.prisma.order.update({
        where: { id: dispute.orderId },
        data: { status: dto.finalOrderStatus },
      }),
    ]);

    // Her iki tarafa da bildirim
    for (const user of [dispute.order.buyerCompany.user, dispute.order.supplierCompany.user]) {
      await this.notifications.create({
        userId: user.id,
        type: 'DISPUTE_RESOLVED',
        title: 'İtiraz Çözümlendi',
        body: `Sipariş itirazı çözümlendi: ${dto.resolution}`,
        data: { orderId: dispute.orderId, disputeId },
      });
    }

    return { message: 'İtiraz çözümlendi' };
  }

  // ── Audit log
  async getAuditLogs(params: { entityType?: string; entityId?: string; page?: number; limit?: number }) {
    const { entityType, entityId, page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { email: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data: logs, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Sektör yönetimi
  async getSectors() {
    return this.prisma.sector.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  async createSector(dto: CreateSectorDto) {
    return this.prisma.sector.create({ data: dto });
  }

  async toggleSector(sectorId: string) {
    const sector = await this.prisma.sector.findUnique({ where: { id: sectorId } });
    if (!sector) throw new NotFoundException('Sektör bulunamadı');
    return this.prisma.sector.update({
      where: { id: sectorId },
      data: { isActive: !sector.isActive },
    });
  }

  // ── Üyelik planları
  async getMembershipPlans() {
    return this.prisma.membershipPlanConfig.findMany();
  }

  // ── Yardımcı: audit log yaz
  private async logAudit(data: {
    userId: string;
    action: any;
    entityType: string;
    entityId: string;
    metadata?: any;
  }) {
    await this.prisma.auditLog.create({ data }).catch(() => {}); // Log hatası uygulamayı durdurmasın
  }
}
