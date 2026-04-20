import { PrismaClient, MembershipPlan } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Admin kullanıcı
  const adminPassword = await bcrypt.hash('Admin123!', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@uta.com.tr' },
    update: {},
    create: {
      email: 'admin@uta.com.tr',
      passwordHash: adminPassword,
      firstName: 'UTA',
      lastName: 'Admin',
      isAdmin: true,
    },
  });
  console.log('✅ Admin kullanıcı:', admin.email);

  // Sektörler
  const sectors = [
    { name: 'Metal ve Çelik', slug: 'metal-celik', sortOrder: 1 },
    { name: 'Tekstil ve Konfeksiyon', slug: 'tekstil-konfeksiyon', sortOrder: 2 },
    { name: 'Gıda ve İçecek', slug: 'gida-icecek', sortOrder: 3 },
    { name: 'Kimya ve Plastik', slug: 'kimya-plastik', sortOrder: 4 },
    { name: 'Makine ve Ekipman', slug: 'makine-ekipman', sortOrder: 5 },
    { name: 'İnşaat Malzemeleri', slug: 'insaat-malzemeleri', sortOrder: 6 },
    { name: 'Elektrik ve Elektronik', slug: 'elektrik-elektronik', sortOrder: 7 },
    { name: 'Tarım ve Hayvancılık', slug: 'tarim-hayvancilik', sortOrder: 8 },
    { name: 'Lojistik ve Taşımacılık', slug: 'lojistik-tasima', sortOrder: 9 },
    { name: 'Ambalaj', slug: 'ambalaj', sortOrder: 10 },
  ];

  for (const sector of sectors) {
    await prisma.sector.upsert({
      where: { slug: sector.slug },
      update: {},
      create: sector,
    });
  }
  console.log(`✅ ${sectors.length} sektör eklendi`);

  // Üyelik planları
  await prisma.membershipPlanConfig.upsert({
    where: { plan: MembershipPlan.FREE },
    update: {},
    create: {
      plan: MembershipPlan.FREE,
      price: 0,
      durationDays: 36500,
      maxActivePosts: 3,
      maxBidsPerMonth: 10,
      isFeatured: false,
      features: ['3 aktif ilan', 'Aylık 10 teklif', 'Temel profil'],
    },
  });

  await prisma.membershipPlanConfig.upsert({
    where: { plan: MembershipPlan.PRO },
    update: {},
    create: {
      plan: MembershipPlan.PRO,
      price: 499,
      durationDays: 30,
      maxActivePosts: 20,
      maxBidsPerMonth: -1,
      isFeatured: false,
      features: ['20 aktif ilan', 'Sınırsız teklif', 'Öncelikli destek', 'Detaylı analitik'],
    },
  });

  await prisma.membershipPlanConfig.upsert({
    where: { plan: MembershipPlan.ENTERPRISE },
    update: {},
    create: {
      plan: MembershipPlan.ENTERPRISE,
      price: 1999,
      durationDays: 30,
      maxActivePosts: -1,
      maxBidsPerMonth: -1,
      isFeatured: true,
      features: [
        'Sınırsız ilan',
        'Sınırsız teklif',
        'Üst sıralarda listeleme',
        'Özel hesap yöneticisi',
        'API erişimi',
        'Gelişmiş raporlar',
      ],
    },
  });
  console.log('✅ Üyelik planları eklendi');

  console.log('\n🎉 Seed tamamlandı!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
