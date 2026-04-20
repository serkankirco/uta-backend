import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CompanyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Şirket oluştur (kayıt sonrası)
  async create(userId: string, dto: CreateCompanyDto) {
    const existing = await this.prisma.company.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Bu hesaba bağlı zaten bir şirket var');

    const taxExists = await this.prisma.company.findUnique({ where: { taxNumber: dto.taxNumber } });
    if (taxExists) throw new ConflictException('Bu vergi numarasıyla kayıtlı bir şirket var');

    return this.prisma.company.create({
      data: { userId, ...dto },
      select: this.companySelect(),
    });
  }

  // ── Kendi şirket profilini getir
  async getMyCompany(userId: string) {
    const company = await this.prisma.company.findUnique({
      where: { userId },
      select: {
        ...this.companySelect(),
        documents: true,
        _count: {
          select: { posts: true, bids: true, ordersAsBuyer: true, ordersAsSupplier: true },
        },
      },
    });
    if (!company) throw new NotFoundException('Şirket profili bulunamadı');
    return company;
  }

  // ── Şirket detay (public)
  async findOne(id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, status: CompanyStatus.APPROVED },
      select: {
        ...this.companySelect(),
        _count: { select: { posts: true } },
        ratingsReceived: {
          select: { score: true, comment: true, createdAt: true, fromCompany: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!company) throw new NotFoundException('Şirket bulunamadı');
    return company;
  }

  // ── Şirket listesi (Feed için)
  async findAll(params: {
    sector?: string;
    city?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { sector, city, search, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: any = { status: CompanyStatus.APPROVED };
    if (sector) where.sector = sector;
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [companies, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        select: this.companySelect(),
        orderBy: [{ isFeatured: 'desc' }, { approvedAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.company.count({ where }),
    ]);

    return {
      data: companies,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Profil güncelle
  async update(userId: string, dto: UpdateCompanyDto) {
    const company = await this.prisma.company.findUnique({ where: { userId } });
    if (!company) throw new NotFoundException('Şirket profili bulunamadı');

    return this.prisma.company.update({
      where: { id: company.id },
      data: dto,
      select: this.companySelect(),
    });
  }

  // ── Belge yükle (storage path dışarıdan gelir, upload servis ayrı olacak)
  async addDocument(userId: string, data: {
    type: string;
    filename: string;
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
    expiresAt?: Date;
  }) {
    const company = await this.prisma.company.findUnique({ where: { userId } });
    if (!company) throw new NotFoundException('Şirket profili bulunamadı');

    return this.prisma.document.create({
      data: { companyId: company.id, ...data } as any,
    });
  }

  // ── Şirkete ait rating özeti
  async getRatingSummary(companyId: string) {
    const ratings = await this.prisma.rating.findMany({
      where: { toCompanyId: companyId },
      select: { score: true },
    });

    if (ratings.length === 0) return { average: null, count: 0 };

    const average = ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length;
    return { average: Math.round(average * 10) / 10, count: ratings.length };
  }

  // ── Yardımcı: select shape
  private companySelect() {
    return {
      id: true,
      name: true,
      taxNumber: true,
      sector: true,
      city: true,
      address: true,
      website: true,
      description: true,
      employeeCount: true,
      foundedYear: true,
      status: true,
      membershipPlan: true,
      isFeatured: true,
      approvedAt: true,
      createdAt: true,
    };
  }
}
