import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    // Email benzersizlik kontrolü
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Bu e-posta adresi zaten kayıtlı');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      },
      select: { id: true, email: true, firstName: true, lastName: true, isAdmin: true },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.isAdmin);
    return { user, ...tokens };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true, firstName: true, lastName: true, isAdmin: true, isActive: true, passwordHash: true },
    });

    if (!user) throw new UnauthorizedException('E-posta veya şifre hatalı');
    if (!user.isActive) throw new UnauthorizedException('Hesabınız askıya alınmıştır');

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) throw new UnauthorizedException('E-posta veya şifre hatalı');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { passwordHash: _, ...userWithoutPassword } = user;
    const tokens = await this.generateTokens(user.id, user.email, user.isAdmin);
    return { user: userWithoutPassword, ...tokens };
  }

  async refreshToken(token: string) {
    const stored = await this.prisma.refreshToken.findUnique({ where: { token }, include: { user: true } });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş token');
    }

    // Rotate: eski token sil, yenisini yaz
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    return this.generateTokens(stored.user.id, stored.user.email, stored.user.isAdmin);
  }

  async logout(userId: string, token: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId, token } });
    return { message: 'Çıkış başarılı' };
  }

  async logoutAll(userId: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return { message: 'Tüm oturumlar kapatıldı' };
  }

  private async generateTokens(userId: string, email: string, isAdmin: boolean) {
    const payload = { sub: userId, email, isAdmin };

    const accessToken = this.jwtService.sign(payload);

    const refreshTokenValue = uuidv4();
    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(refreshExpiresIn));

    await this.prisma.refreshToken.create({
      data: { token: refreshTokenValue, userId, expiresAt },
    });

    return { accessToken, refreshToken: refreshTokenValue };
  }
}
