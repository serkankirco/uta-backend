import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // ── Güvenlik
  app.use(helmet());
  app.use(compression());

  // ── CORS
  const corsOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:3001');
  app.enableCors({
    origin: corsOrigins.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ── API Versiyonlama
  app.enableVersioning({ type: VersioningType.URI });
  app.setGlobalPrefix('api');

  // ── Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // DTO'da olmayan field'ları sil
      forbidNonWhitelisted: true,
      transform: true,          // string -> number dönüşümü vb.
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── Swagger (sadece dev/staging)
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('UTA API')
      .setDescription('Ulusal Tedarik Ağı - REST API Dokümantasyonu')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .addTag('Auth', 'Kimlik doğrulama')
      .addTag('Companies', 'Şirket yönetimi')
      .addTag('Posts', 'İlan yönetimi')
      .addTag('Bids', 'Teklif yönetimi')
      .addTag('Orders', 'Sipariş yönetimi')
      .addTag('Admin', 'Yönetici paneli')
      .addTag('Notifications', 'Bildirimler')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    console.log(`📖 Swagger: http://localhost:${port}/api/docs`);
  }

  await app.listen(port);
  console.log(`🚀 UTA API çalışıyor: http://localhost:${port}/api`);
  console.log(`🌍 Ortam: ${nodeEnv}`);
}

bootstrap();
