import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PostStatus, CompanyStatus, MembershipPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsQueryDto } from './dto/posts-query.dto';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreatePostDto) {
    const company = await this.getApprovedCompany(userId);
    await this.checkPostLimit(company.id, company.membershipPlan);

    const { tags, ...postData } = dto;

    return this.prisma.post.create({
      data: {
        ...postData,
        companyId: company.id,
        tags: tags?.length
          ? { create: tags.map((tag) => ({ tag })) }
          : undefined,
      },
      include: { tags: true, company: { select: { id: true, name: true, city: true } } },
    });
  }

  async findAll(query: PostsQueryDto) {
    const { sector, category, city, search, status, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      status: status ?? PostStatus.ACTIVE,
      visibility: 'PUBLIC',
      company: { status: CompanyStatus.APPROVED },
    };

    if (sector) where.sector = sector;
    if (category) where.category = { contains: category, mode: 'insensitive' };
    if (city) where.deliveryCity = { contains: city, mode: 'insensitive' };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: {
          company: { select: { id: true, name: true, city: true, isFeatured: true } },
          tags: true,
          _count: { select: { bids: true } },
        },
        orderBy: [
          { company: { isFeatured: 'desc' } },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      data: posts,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, city: true, sector: true, membershipPlan: true } },
        tags: true,
        _count: { select: { bids: true } },
      },
    });

    if (!post) throw new NotFoundException('İlan bulunamadı');

    // Görüntülenme sayısını artır (async, hata bloklamamalı)
    this.prisma.post.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch(() => {});

    return post;
  }

  async findMyPosts(userId: string, page = 1, limit = 20) {
    const company = await this.prisma.company.findUnique({ where: { userId } });
    if (!company) throw new NotFoundException('Şirket profili bulunamadı');

    const skip = (page - 1) * limit;
    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: { companyId: company.id },
        include: { tags: true, _count: { select: { bids: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.post.count({ where: { companyId: company.id } }),
    ]);

    return { data: posts, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async update(userId: string, postId: string, dto: UpdatePostDto) {
    const post = await this.findPostWithOwnerCheck(userId, postId);
    if (post.status === PostStatus.COMPLETED || post.status === PostStatus.CANCELLED) {
      throw new BadRequestException('Tamamlanmış veya iptal edilmiş ilan güncellenemez');
    }

    const { tags, ...postData } = dto;

    return this.prisma.post.update({
      where: { id: postId },
      data: {
        ...postData,
        ...(tags !== undefined && {
          tags: {
            deleteMany: {},
            create: tags.map((tag) => ({ tag })),
          },
        }),
      },
      include: { tags: true },
    });
  }

  async closePost(userId: string, postId: string) {
    await this.findPostWithOwnerCheck(userId, postId);
    return this.prisma.post.update({
      where: { id: postId },
      data: { status: PostStatus.CLOSED, closedAt: new Date() },
    });
  }

  async cancelPost(userId: string, postId: string) {
    const post = await this.findPostWithOwnerCheck(userId, postId);
    if (post.status === PostStatus.COMPLETED) {
      throw new BadRequestException('Tamamlanmış ilan iptal edilemez');
    }
    return this.prisma.post.update({
      where: { id: postId },
      data: { status: PostStatus.CANCELLED },
    });
  }

  // ── Yardımcılar
  private async getApprovedCompany(userId: string) {
    const company = await this.prisma.company.findUnique({ where: { userId } });
    if (!company) throw new NotFoundException('Şirket profili bulunamadı');
    if (company.status !== CompanyStatus.APPROVED) {
      throw new ForbiddenException('Şirketiniz henüz onaylanmadı');
    }
    return company;
  }

  private async checkPostLimit(companyId: string, plan: MembershipPlan) {
    const planConfig = await this.prisma.membershipPlanConfig.findUnique({ where: { plan } });
    if (!planConfig || planConfig.maxActivePosts === -1) return; // sınırsız

    const activeCount = await this.prisma.post.count({
      where: { companyId, status: PostStatus.ACTIVE },
    });

    if (activeCount >= planConfig.maxActivePosts) {
      throw new ForbiddenException(
        `${plan} planıyla en fazla ${planConfig.maxActivePosts} aktif ilan oluşturabilirsiniz. Pro'ya yükseltin!`,
      );
    }
  }

  private async findPostWithOwnerCheck(userId: string, postId: string) {
    const company = await this.prisma.company.findUnique({ where: { userId } });
    if (!company) throw new NotFoundException('Şirket profili bulunamadı');

    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('İlan bulunamadı');
    if (post.companyId !== company.id) throw new ForbiddenException('Bu ilan size ait değil');

    return post;
  }
}
