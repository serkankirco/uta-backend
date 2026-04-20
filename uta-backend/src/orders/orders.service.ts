import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OpenDisputeDto } from './dto/open-dispute.dto';
import { CreateRatingDto } from './dto/create-rating.dto';

// Geçerli durum geçişleri (state machine)
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.CREATED]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
  [OrderStatus.IN_PROGRESS]: [OrderStatus.SHIPPED, OrderStatus.DISPUTED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.DISPUTED],
  [OrderStatus.DELIVERED]: [OrderStatus.COMPLETED, OrderStatus.DISPUTED],
  [OrderStatus.DISPUTED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Sipariş listesi (alıcı veya tedarikçi)
  async findAll(userId: string, role: 'buyer' | 'supplier' | 'all' = 'all', page = 1, limit = 20) {
    const company = await this.prisma.company.findUnique({ where: { userId } });
    if (!company) throw new NotFoundException('Şirket profili bulunamadı');

    const skip = (page - 1) * limit;
    const where: any = {};

    if (role === 'buyer') where.buyerCompanyId = company.id;
    else if (role === 'supplier') where.supplierCompanyId = company.id;
    else where.OR = [{ buyerCompanyId: company.id }, { supplierCompanyId: company.id }];

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          bid: { include: { post: { select: { id: true, title: true } } } },
          buyerCompany: { select: { id: true, name: true } },
          supplierCompany: { select: { id: true, name: true } },
          dispute: { select: { id: true, status: true } },
          rating: { select: { score: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return { data: orders, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  // ── Sipariş detayı
  async findOne(userId: string, orderId: string) {
    const company = await this.prisma.company.findUnique({ where: { userId } });
    if (!company) throw new NotFoundException('Şirket profili bulunamadı');

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        bid: { include: { post: true } },
        buyerCompany: { select: { id: true, name: true, city: true } },
        supplierCompany: { select: { id: true, name: true, city: true } },
        statusHistory: { orderBy: { changedAt: 'asc' } },
        dispute: true,
        rating: true,
      },
    });

    if (!order) throw new NotFoundException('Sipariş bulunamadı');

    const isParty =
      order.buyerCompanyId === company.id || order.supplierCompanyId === company.id;
    if (!isParty) throw new ForbiddenException('Bu siparişe erişim yetkiniz yok');

    return order;
  }

  // ── Durum güncelle (state machine)
  async updateStatus(userId: string, orderId: string, dto: UpdateOrderStatusDto) {
    const { order, company } = await this.getOrderWithPartyCheck(userId, orderId);

    const allowed = ALLOWED_TRANSITIONS[order.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `"${order.status}" durumundan "${dto.status}" durumuna geçilemez`,
      );
    }

    // Tedarikçi mi alıcı mı kontrol et
    this.checkRolePermission(order, company.id, dto.status);

    const now = new Date();
    const extraData: Record<string, any> = {};
    if (dto.status === OrderStatus.DELIVERED) extraData.deliveredAt = now;
    if (dto.status === OrderStatus.COMPLETED) extraData.completedAt = now;
    if (dto.status === OrderStatus.CANCELLED) extraData.cancelledAt = now;
    if (dto.status === OrderStatus.CANCELLED && dto.note) extraData.cancelReason = dto.note;

    const [updatedOrder] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: { status: dto.status, ...extraData },
      }),
      this.prisma.orderStatusHistory.create({
        data: {
          orderId,
          status: dto.status,
          note: dto.note,
          changedBy: userId,
        },
      }),
    ]);

    // Karşı tarafa bildirim
    const otherUserId = await this.getOtherPartyUserId(order, company.id);
    if (otherUserId) {
      await this.notifications.create({
        userId: otherUserId,
        type: 'ORDER_STATUS_CHANGED',
        title: 'Sipariş Durumu Güncellendi',
        body: `Sipariş durumu "${dto.status}" olarak güncellendi`,
        data: { orderId },
      });
    }

    return updatedOrder;
  }

  // ── İtiraz aç
  async openDispute(userId: string, orderId: string, dto: OpenDisputeDto) {
    const { order, company } = await this.getOrderWithPartyCheck(userId, orderId);

    const canDispute: OrderStatus[] = [
      OrderStatus.IN_PROGRESS,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ];
    if (!canDispute.includes(order.status)) {
      throw new BadRequestException('Bu sipariş durumunda itiraz açılamaz');
    }

    const existing = await this.prisma.dispute.findUnique({ where: { orderId } });
    if (existing) throw new ConflictException('Bu sipariş için zaten açık bir itiraz var');

    const [dispute] = await this.prisma.$transaction([
      this.prisma.dispute.create({
        data: {
          orderId,
          openedBy: company.id,
          reason: dto.reason,
          description: dto.description,
        },
      }),
      this.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.DISPUTED },
      }),
      this.prisma.orderStatusHistory.create({
        data: { orderId, status: OrderStatus.DISPUTED, note: `İtiraz: ${dto.reason}`, changedBy: userId },
      }),
    ]);

    // Admin ve karşı tarafa bildirim
    const otherUserId = await this.getOtherPartyUserId(order, company.id);
    if (otherUserId) {
      await this.notifications.create({
        userId: otherUserId,
        type: 'DISPUTE_OPENED',
        title: 'Siparişe İtiraz Açıldı',
        body: `Sipariş #${orderId.slice(0, 8)} için itiraz açıldı: ${dto.reason}`,
        data: { orderId, disputeId: dispute.id },
      });
    }

    return dispute;
  }

  // ── Değerlendirme bırak (sipariş tamamlandıktan sonra)
  async createRating(userId: string, orderId: string, dto: CreateRatingDto) {
    const { order, company } = await this.getOrderWithPartyCheck(userId, orderId);

    if (order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException('Sadece tamamlanan siparişler değerlendirilebilir');
    }

    const existing = await this.prisma.rating.findFirst({
      where: { orderId, fromCompanyId: company.id },
    });
    if (existing) throw new ConflictException('Bu siparişi zaten değerlendirdiniz');

    const toCompanyId =
      order.buyerCompanyId === company.id ? order.supplierCompanyId : order.buyerCompanyId;

    return this.prisma.rating.create({
      data: {
        orderId,
        fromCompanyId: company.id,
        toCompanyId,
        score: dto.score,
        comment: dto.comment,
      },
    });
  }

  // ── Yardımcılar
  private async getOrderWithPartyCheck(userId: string, orderId: string) {
    const company = await this.prisma.company.findUnique({ where: { userId } });
    if (!company) throw new NotFoundException('Şirket profili bulunamadı');

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Sipariş bulunamadı');

    const isParty =
      order.buyerCompanyId === company.id || order.supplierCompanyId === company.id;
    if (!isParty) throw new ForbiddenException('Bu siparişe erişim yetkiniz yok');

    return { order, company };
  }

  private checkRolePermission(order: any, companyId: string, newStatus: OrderStatus) {
    const isSupplier = order.supplierCompanyId === companyId;
    const isBuyer = order.buyerCompanyId === companyId;

    // Tedarikçi geçişleri
    const supplierTransitions: OrderStatus[] = [
      OrderStatus.CONFIRMED,
      OrderStatus.IN_PROGRESS,
      OrderStatus.SHIPPED,
    ];
    // Alıcı geçişleri
    const buyerTransitions: OrderStatus[] = [
      OrderStatus.DELIVERED,
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED,
    ];
    // Her iki taraf
    const bothTransitions: OrderStatus[] = [OrderStatus.DISPUTED];

    if (supplierTransitions.includes(newStatus) && !isSupplier) {
      throw new ForbiddenException('Bu durum geçişini sadece tedarikçi yapabilir');
    }
    if (buyerTransitions.includes(newStatus) && !isBuyer) {
      throw new ForbiddenException('Bu durum geçişini sadece alıcı yapabilir');
    }
  }

  private async getOtherPartyUserId(order: any, myCompanyId: string): Promise<string | null> {
    const otherCompanyId =
      order.buyerCompanyId === myCompanyId ? order.supplierCompanyId : order.buyerCompanyId;

    const company = await this.prisma.company.findUnique({
      where: { id: otherCompanyId },
      include: { user: { select: { id: true } } },
    });
    return company?.user?.id ?? null;
  }
}
