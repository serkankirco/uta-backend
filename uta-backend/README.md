# UTA Backend — Ulusal Tedarik Ağı API

NestJS + PostgreSQL + Redis + MinIO ile inşa edilmiş B2B tedarik platformu backend'i.

---

## İçindekiler

- [Gereksinimler](#gereksinimler)
- [Yerel Geliştirme](#yerel-geliştirme)
- [VPS'e Deploy](#vpse-deploy)
- [API Dökümantasyonu](#api-dökümantasyonu)
- [Proje Yapısı](#proje-yapısı)
- [Modüller ve Endpoint'ler](#modüller-ve-endpointler)
- [Ortam Değişkenleri](#ortam-değişkenleri)

---

## Gereksinimler

| Araç | Minimum Versiyon |
|------|-----------------|
| Docker | 24+ |
| Docker Compose | v2+ |
| Node.js (yerel geliştirme için) | 20+ |

---

## Yerel Geliştirme

```bash
# 1. Repo'yu klonla
git clone https://github.com/yourorg/uta-backend.git
cd uta-backend

# 2. Ortam dosyasını hazırla
cp .env.example .env
# .env içindeki değerleri düzenle

# 3. Bağımlılıkları yükle
npm install

# 4. Docker ile sadece altyapıyı başlat (DB + Redis + MinIO)
docker compose up postgres redis minio -d

# 5. Prisma migration + seed
npm run prisma:migrate
npm run prisma:seed

# 6. Uygulamayı başlat
npm run start:dev
```

API: http://localhost:3000/api  
Swagger: http://localhost:3000/api/docs  
MinIO Console: http://localhost:9001

---

## VPS'e Deploy

### 1. Sunucuya Git ve Repo'yu Klonla

```bash
ssh user@your-vps-ip

git clone https://github.com/yourorg/uta-backend.git
cd uta-backend
```

### 2. .env Dosyasını Hazırla

```bash
cp .env.example .env
nano .env
```

**Mutlaka değiştirmen gereken değerler:**

```env
DATABASE_URL=postgresql://uta_user:GUCLU_SIFRE@postgres:5432/uta_db
POSTGRES_PASSWORD=GUCLU_SIFRE

REDIS_PASSWORD=BASKA_GUCLU_SIFRE

JWT_SECRET=en-az-64-karakter-rastgele-string-buraya-gelmeli
JWT_REFRESH_SECRET=bu-da-farkli-ve-uzun-olmali

MINIO_ACCESS_KEY=guclu-access-key
MINIO_SECRET_KEY=guclu-secret-key

CORS_ORIGINS=https://senin-domain.com
APP_URL=https://api.senin-domain.com
```

> JWT secret üretmek için:
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

### 3. Production'da Gereksiz Port'ları Kapat

`docker-compose.yml` içinde aşağıdaki satırları kaldır veya yorum satırı yap:

```yaml
# postgres:
#   ports:
#     - '5432:5432'   # ← Bu satırı kaldır

# redis:
#   ports:
#     - '6379:6379'   # ← Bu satırı kaldır
```

Sadece `api` ve `minio` portları dışarıya açık olmalı.

### 4. Docker ile Başlat

```bash
# İlk başlatma (build + migrate + seed)
docker compose up -d --build

# Logları izle
docker compose logs -f api

# Sağlık kontrolü
curl http://localhost:3000/health
```

### 5. Nginx ile Reverse Proxy

```nginx
server {
    listen 80;
    server_name api.senin-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name api.senin-domain.com;

    ssl_certificate /etc/letsencrypt/live/api.senin-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.senin-domain.com/privkey.pem;

    client_max_body_size 20M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

SSL için:
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d api.senin-domain.com
```

### 6. Güncelleme (Yeni Sürüm Deploy)

```bash
git pull origin main
docker compose up -d --build api
docker compose exec api npx prisma migrate deploy
```

---

## API Dökümantasyonu

Uygulama `development` ortamında çalışırken Swagger UI'a erişilebilir:

```
http://localhost:3000/api/docs
```

---

## Proje Yapısı

```
src/
├── main.ts                    # Bootstrap, Swagger, CORS, Helmet
├── app.module.ts              # Root modül
│
├── prisma/                    # PrismaService (global)
│
├── auth/                      # JWT auth, register, login, refresh
│   ├── strategies/            # JWT Passport stratejisi
│   ├── guards/                # JwtAuthGuard, AdminGuard
│   └── dto/
│
├── companies/                 # Şirket CRUD, belge, rating
├── posts/                     # İlan CRUD, feed, plan limiti
├── bids/                      # Teklif, karşı teklif, kabul/red
├── orders/                    # Sipariş state machine, dispute, rating
├── admin/                     # Dashboard, onay, itiraz, audit log
├── notifications/             # Bildirim sistemi
├── health/                    # Health check endpoint
│
└── common/
    └── decorators/
        └── current-user.decorator.ts
```

---

## Modüller ve Endpoint'ler

### Auth — `/api/v1/auth`
| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/register` | Yeni kullanıcı kaydı |
| POST | `/login` | Giriş yap |
| POST | `/refresh` | Access token yenile |
| POST | `/logout` | Oturumu kapat |
| POST | `/logout-all` | Tüm oturumları kapat |

### Companies — `/api/v1/companies`
| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/` | Şirket profili oluştur |
| GET | `/` | Onaylı şirketleri listele |
| GET | `/me` | Kendi şirket profilim |
| PATCH | `/me` | Profili güncelle |
| GET | `/:id` | Şirket detayı |
| GET | `/:id/ratings` | Şirket değerlendirmeleri |

### Posts — `/api/v1/posts`
| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/` | Yeni ilan oluştur |
| GET | `/` | İlan feed'i (filtreleme destekli) |
| GET | `/me` | Kendi ilanlarım |
| GET | `/:id` | İlan detayı |
| PATCH | `/:id` | İlanı güncelle |
| PATCH | `/:id/close` | İlanı kapat |
| PATCH | `/:id/cancel` | İlanı iptal et |

### Bids — `/api/v1/bids`
| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/post/:postId` | İlana teklif ver |
| GET | `/post/:postId` | İlanın teklifleri (ilan sahibi) |
| GET | `/me` | Verdiğim teklifler |
| POST | `/:id/counter-offer` | Karşı teklif sun |
| PATCH | `/:id/accept` | Teklifi kabul et → Sipariş oluşturur |
| PATCH | `/:id/reject` | Teklifi reddet |
| PATCH | `/:id/withdraw` | Teklifimi geri çek |

### Orders — `/api/v1/orders`
| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/` | Siparişlerim (buyer/supplier/all) |
| GET | `/:id` | Sipariş detayı |
| PATCH | `/:id/status` | Durum güncelle |
| POST | `/:id/dispute` | İtiraz aç |
| POST | `/:id/rating` | Değerlendirme bırak |

### Admin — `/api/v1/admin` *(Admin yetkisi gerekli)*
| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/dashboard` | Platform istatistikleri |
| GET | `/companies` | Tüm şirketler |
| GET | `/companies/pending` | Onay bekleyenler |
| PATCH | `/companies/:id/review` | Onayla / Reddet |
| PATCH | `/companies/:id/suspend` | Askıya al |
| GET | `/disputes` | İtiraz listesi |
| PATCH | `/disputes/:id/resolve` | İtirazı çöz |
| GET | `/audit-logs` | Denetim kayıtları |
| GET | `/sectors` | Sektör listesi |
| POST | `/sectors` | Sektör ekle |
| PATCH | `/sectors/:id/toggle` | Sektör aktif/pasif |
| GET | `/membership-plans` | Üyelik planları |

### Notifications — `/api/v1/notifications`
| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/` | Bildirimlerim |
| GET | `/unread-count` | Okunmamış sayısı |
| PATCH | `/read-all` | Tümünü okundu işaretle |
| PATCH | `/:id/read` | Bildirimi okundu işaretle |

---

## Sipariş Durum Makinesi

```
CREATED → CONFIRMED → IN_PROGRESS → SHIPPED → DELIVERED → COMPLETED
    ↓          ↓            ↓           ↓          ↓
CANCELLED  CANCELLED    DISPUTED    DISPUTED   DISPUTED
                            ↓
                    COMPLETED / CANCELLED
```

| Geçiş | Kim Yapar |
|-------|-----------|
| CREATED → CONFIRMED | Tedarikçi |
| CONFIRMED → IN_PROGRESS | Tedarikçi |
| IN_PROGRESS → SHIPPED | Tedarikçi |
| SHIPPED → DELIVERED | Alıcı |
| DELIVERED → COMPLETED | Alıcı |
| * → CANCELLED | Alıcı |
| * → DISPUTED | Her iki taraf |

---

## Ortam Değişkenleri

| Değişken | Açıklama | Örnek |
|----------|----------|-------|
| `NODE_ENV` | Ortam | `production` |
| `PORT` | API portu | `3000` |
| `DATABASE_URL` | PostgreSQL bağlantısı | `postgresql://...` |
| `REDIS_HOST` | Redis host | `redis` |
| `REDIS_PASSWORD` | Redis şifresi | `guclu-sifre` |
| `JWT_SECRET` | JWT imzalama anahtarı (64+ karakter) | `...` |
| `JWT_EXPIRES_IN` | Access token süresi | `15m` |
| `JWT_REFRESH_SECRET` | Refresh token anahtarı | `...` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token süresi | `7d` |
| `MINIO_ENDPOINT` | MinIO host | `minio` |
| `MINIO_ACCESS_KEY` | MinIO erişim anahtarı | `...` |
| `MINIO_SECRET_KEY` | MinIO gizli anahtar | `...` |
| `MINIO_BUCKET` | Belge depolama bucket | `uta-documents` |
| `CORS_ORIGINS` | İzin verilen originler | `https://uta.com.tr` |

---

## Faydalı Komutlar

```bash
# Container durumları
docker compose ps

# API logları (canlı)
docker compose logs -f api

# PostgreSQL'e bağlan
docker compose exec postgres psql -U uta_user -d uta_db

# Redis'e bağlan
docker compose exec redis redis-cli -a $REDIS_PASSWORD

# Prisma Studio (veritabanı GUI) — sadece local
npm run prisma:studio

# Yeni migration oluştur
npm run prisma:migrate -- --name migration_adi

# Production migration
npm run prisma:migrate:prod
```

---

## Sonraki Adımlar (Faz 2)

- [ ] **Ödeme Entegrasyonu** — İyzico / Stripe ile üyelik paketleri
- [ ] **Escrow Sistemi** — Güvenli sipariş ödemesi
- [ ] **WebSocket** — Gerçek zamanlı bildirim ve mesajlaşma
- [ ] **E-posta Bildirimleri** — Nodemailer şablonları
- [ ] **Dosya Yükleme** — MinIO entegrasyonu tamamlama
- [ ] **Rate Limiting** — Endpoint bazlı kısıtlama
- [ ] **Faz 3** — Analitik dashboard, fiyat endeksi
