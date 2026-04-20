import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { BidStatus, PostStatus, CompanyStatus, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { CounterOfferDto } from './dto/counter-offer.dto';

@Injectable()
export class BidsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Teklif ver
  async create(userId: string, postId: string, dto: CreateBidDto) {
    const company = await this.getApprovedCompany(userId);

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { company: { include: { user: true } } },
    });

    if (!post) throw new NotFoundException('İlan bulunamadı');
    if (post.status !== PostStatus.ACTIVE) throw new BadRequestException('Bu ilan artık aktif değil');
    if (post.companyId === company.id) throw new ForbiddenException('Kendi ilanınıza teklif veremezsiniz');

    // Aynı ilana zaten bekleyen teklif var mı?
    const existingBid = await this.prisma.bid.findFirst({
      where: { postId, companyId: company.id, status: BidStatus.PENDING },
    });
    if (existingBid) throw new ConflictException('Bu ilana zaten bekleyen bir teklifiniz var');

    const totalPrice = dto.quantity ? dto.unitPrice * dto.quantity : dto.unitPrice;

    const bid = await this.prisma.bid.create({
      data: {
        postId,
        companyId: company.id,
        unitPrice: dto.unitPrice,
        quantity: dto.quantity,
        totalPrice,
        currency: dto.currency ?? 'TRY',
        deliveryDays: dto.deliveryDays,
        validUntil: new Date(dto.validUntil),
        note: dto.note,
      },
      include: { company: { select: { name: true } } },
    });

    // İlan sahibine bildirim
    await this.notifications.create({
      userId: post.company.user.id,
      type: 'NEW_BID',
      title: 'Yeni Teklif Alındı',
      body: `${company.name} şirketi "${post.title}" ilanınıza teklif verdi`,
      data: { bidId: bid.id, postId },
    });

    return bid;
  }

  // ── İlana gelen teklifleri listele (ilan sahibi)
  async findByPost(userId: string, postId: string) {
    const company = await this.prisma.company.findUnique({ where: { userId } });
    const post = await this.prisma.post.findUnique({ where: { id: postId } });

    if (!post) throw new NotFoundException('İlan bulunamadı');
    if (post.companyId !== company?.id) throw new ForbiddenException('Bu ilan size ait değil');

    return this.prisma.bid.findMany({
      where: { postId, parentBidId: null }, // Sadece ilk seviye teklifler
      include: {
        company: { select: { id: true, name: true, city: true, sector: true } },
        counterOffers: {
          include: { company: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Kendi verdiğim teklifler
  async findMyBids(userId: string, page = 1, limit = 20) {
    const company = await this.prisma.company.findUnique({ where: { userId } });
    if (!company) throw new NotFoundException('Şirket profili bulunamadı');

    const skip = (page - 1) * limit;
    const [bids, total] = await Promise.all([
      this.prisma.bid.findMany({
        where: { companyId: company.id },
        include: {
          post: { select: { id: true, title: true, sector: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.bid.count({ where: { companyId: company.id } }),
    ]);

    return { data: bids, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Karşı teklif sun
  async counterOffer(userId: string, bidId: string, dto: CounterOfferDto) {
    const company = await this.getApprovedCompany(userId);
    const parentBid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      include: { post: { include: { company: { include: { user: true } } } }, company: { include: { user: true } } },
    });

    if (!parentBid) throw new NotFoundException('Teklif bulunamadı');
    if (parentBid.status !== BidStatus.PENDING) throw new BadRequestException('Bu teklif artık karşı teklif için uygun değil');

    // Sadece ilan sahibi karşı teklif yapabilir
    if (parentBid.post.companyId !== company.id) throw new ForbiddenException('Sadece ilan sahibi karşı teklif yapabilir');

    const totalPrice = dto.quantity ? dto.unitPrice * dto.quantity : dto.unitPrice;

    // Parent teklifi güncelle
    await this.prisma.bid.update({
      where: { id: bidId },
      data: { status: BidStatus.COUNTER_OFFER },
    });

    const counterBid = await this.prisma.bid.create({
      data: {
        postId: parentBid.postId,
        companyId: company.id,
        parentBidId: bidId,
        unitPrice: dto.unitPrice,
        quantity: dto.quantity,
        totalPrice,
        currency: dto.currency ?? parentBid.currency,
        deliveryDays: dto.deliveryDays,
        validUntil: new Date(dto.validUntil),
        note: dto.note,
      },
    });

    // Teklif verene bildirim
    await this.notifications.create({
      userId: parentBid.company.user.id,
      type: 'COUNTER_OFFER',
      title: 'Karşı Teklif Geldi',
      body: `"${parentBid.post.title}" ilanında karşı teklif yapıldı`,
      data: { bidId: counterBid.id, postId: parentBid.postId },
    });

    return counterBid;
  }

  // ── Teklifi kabul et → otomatik sipariş oluştur
  async accept(userId: string, bidId: string) {
    const company = await this.getApprovedCompany(userId);
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      include: {
        post: { include: { company: { include: { user: true } } } },
        company: { include: { user: true } },
      },
    });

    if (!bid) throw new NotFoundException('Teklif bulunamadı');
    if (bid.status !== BidStatus.PENDING) throw new BadRequestException('Bu teklif artık kabul edilebilir durumda değil');
    if (bid.post.companyId !== company.id) throw new ForbiddenException('Bu ilan size ait değil');

    // Transaction: teklifi onayla + sipariş oluştur
    const [updatedBid, order] = await this.prisma.$transaction([
      this.prisma.bid.update({
        where: { id: bidId },
        data: { status: BidStatus.ACCEPTED },
      }),
      this.prisma.order.create({
        data: {
          bidId,
          buyerCompanyId: company.id,
          supplierCompanyId: bid.companyId,
          totalAmount: bid.totalPrice,
          currency: bid.currency,
          status: OrderStatus.CREATED,
        },
      }),
      // Diğer teklifleri reddet
      this.prisma.bid.updateMany({
        where: { postId: bid.postId, id: { not: bidId }, status: BidStatus.PENDING },
        data: { status: BidStatus.REJECTED },
      }),
      // İlanı kapat
      this.prisma.post.update({
        where: { id: bid.postId },
        data: { status: PostStatus.CLOSED, closedAt: new Date() },
      }),
    ]);

    // Tedarikçiye bildirim
    await this.notifications.create({
      userId: bid.company.user.id,
      type: 'BID_ACCEPTED',
      title: 'Teklifiniz Kabul Edildi! 🎉',
      body: `"${bid.post.title}" ilanındaki teklifiniz kabul edildi. Sipariş oluşturuldu.`,
      data: { orderId: order.id, bidId },
    });

    return { bid: updatedBid, order };
  }

  // ── Teklifi reddet
  async reject(userId: string, bidId: string) {
    const company = await this.getApprovedCompany(userId);
    const bid = await this.prisma.bid.findUnique({
      where: { id: bidId },
      include: { post: true, company: { include: { user: true } } },
    });

    if (!bid) throw new NotFoundException('Teklif bulunamadı');
    if (bid.post.companyId !== company.id) throw new ForbiddenException('Bu ilan size ait değil');
    if (bid.status !== BidStatus.PENDING) throw new BadRequestException('Bu teklif reddedilebilir durumda değil');

    await this.prisma.bid.update({ where: { id: bidId }, data: { status: BidStatus.REJECTED } });

    await this.notifications.create({
      userId: bid.company.user.id,
      type: 'BID_REJECTED',
      title: 'Teklifiniz Reddedildi',
      body: `"${bid.post.title}" ilanındaki teklifiniz reddedildi`,
      data: { bidId, postId: bid.postId },
    });

    return { message: 'Teklif reddedildi' };
  }

  // ── Teklifi geri çek
  async withdraw(userId: string, bidId: string) {
    const company = await this.getApprovedCompany(userId);
    const bid = await this.prisma.bid.findUnique({ where: { id: bidId } });

    if (!bid) throw new NotFoundException('Teklif bulunamadı');
    if (bid.companyId !== company.id) throw new ForbiddenException('Bu teklif size ait değil');
    if (bid.status !== BidStatus.PENDING) throw new BadRequestException('Sadece bekleyen teklifler geri çekilebilir');

    return this.prisma.bid.update({ where: { id: bidId }, data: { status: BidStatus.WITHDRAWN } });
  }

  private async getApprovedCompany(userId: string) {
    const company = await this.prisma.company.findUnique({ where: { userId } });
    if (!company) throw new NotFoundException('Şirket profili bulunamadı');
    if (company.status !== CompanyStatus.APPROVED) {
      throw new ForbiddenException('Şirketiniz henüz onaylanmadı');
    }
    return company;
  }
}
