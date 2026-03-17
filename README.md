# 9Tools Document Management System

ระบบบริหารจัดการเอกสารแบบครบวงจรสำหรับฝ่าย GPF และฝ่ายเอกสารที่เกี่ยวข้อง

## ภาพรวมระบบ

ระบบนี้พัฒนาขึ้นเพื่อให้บริการจัดการเอกสารอย่างครบวงจร รองรับการทำงานบน DirectAdmin บน Ubuntu 22.04.5 LTS สำหรับโดเมน 9tools.upz.in.th

## คุณสมบัติหลัก

### ระบบยืนยันตัวตน
- ล็อกอินด้วย Gmail ผ่าน OAuth 2.0
- สมัครสมาชิกด้วยอีเมลและรหัสผ่าน
- ยืนยันตัวตนสองขั้นตอน (2FA) ด้วย OTP
- รีเซ็ตรหัสผ่านผ่านอีเมล

### การจัดการผู้ใช้งาน
- **แอดมิน**: สิทธิ์เต็มในการจัดการระบบทั้งหมด
- **แมเนเจอร์**: จัดการเอกสาร ดาวน์โหลด อัปโหลด
- **ยูเซอร์**: ดูรายละเอียด PDF และดาวน์โหลดไฟล์ที่ได้รับอนุญาต

### การจัดการเอกสาร
- จัดการโฟลเดอร์และหมวดหมู่แบบหลายระดับ
- อัปโหลดไฟล์ขนาดใหญ่พร้อม Chunked Upload
- ตรวจสอบประเภทไฟล์และไวรัส
- แปลงไฟล์เป็น PDF อัตโนมัติ
- ค้นหาขั้นสูงพร้อมการกรองและแท็ก

### ความปลอดภัย
- เข้ารหัสไฟล์ AES-256 (Encryption at Rest & in Transit)
- ป้องกันการเข้าถึงโดยไม่ได้รับอนุญาต
- จำกัดครั้งการล็อกอินผิดพลาด
- บันทึกประวัติการเข้าใช้งาน

### ระบบตรวจสอบและแจ้งเตือน
- บันทึกประวัติการดาวน์โหลด/อัปโหลดทุกรายการ
- Audit Trail สำหรับทุกการกระทำ
- แจ้งเตือนทางอีเมลเมื่อมีการอัปโหลด/ดาวน์โหลด
- แจ้งเตือนวันหมดอายุเอกสาร

## เทคโนโลยีที่ใช้

### Backend
- **Node.js** พร้อม **Express.js**
- **PostgreSQL** สำหรับฐานข้อมูล
- **Redis** สำหรับแคชและเซสชัน
- **JWT** สำหรับการยืนยันตัวตน
- **Multer** สำหรับการอัปโหลดไฟล์
- **Sharp** สำหรับการประมวลผลภาพ

### Frontend
- **Next.js 14** พร้อม **React 18**
- **TypeScript**
- **Tailwind CSS** สำหรับการออกแบบ
- **Lucide React** สำหรับไอคอน
- **React Hook Form** สำหรับการจัดการฟอร์ม
- **Zustand** สำหรับการจัดการสถานะ

### Security
- **bcrypt** สำหรับการเข้ารหัสรหัสผ่าน
- **crypto** สำหรับการเข้ารหัสไฟล์
- **helmet** สำหรับความปลอดภัย HTTP headers
- **express-rate-limit** สำหรับจำกัดอัตราการร้องขอ

### Infrastructure
- **Docker** สำหรับการจัดการคอนเทนเนอร์
- **Nginx** สำหรับ reverse proxy
- **PM2** สำหรับการจัดการโปรเซส Node.js
- **Let's Encrypt** สำหรับ SSL Certificate

## โครงสร้างโปรเจค

```
9tools/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── services/
│   │   ├── utils/
│   │   └── config/
│   ├── uploads/
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── store/
│   │   ├── types/
│   │   └── utils/
│   ├── public/
│   ├── package.json
│   └── Dockerfile
├── database/
│   ├── migrations/
│   └── seeds/
├── docs/
│   ├── user-manual/
│   └── technical-docs/
├── docker-compose.yml
└── README.md
```

## การติดตั้งและการใช้งาน

### ข้อกำหนดเบื้องต้น
- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Docker & Docker Compose

### การติดตั้ง
1. Clone repository
2. ติดตั้ง dependencies: `npm install`
3. ตั้งค่าฐานข้อมูล: `npm run db:migrate`
4. เริ่มต้นระบบ: `docker-compose up -d`

## เอกสารประกอบ

- [คู่มือการใช้งานผู้ใช้](docs/user-manual/)
- [เอกสารทางเทคนิค](docs/technical-docs/)
- [API Documentation](docs/api/)

## ใบอนุญาต

MIT License
