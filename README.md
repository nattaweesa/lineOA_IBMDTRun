# LINE OA IBMDT Run

Backend สำหรับรับผลวิ่งจาก LINE OA, วิเคราะห์ภาพหน้าจอผลวิ่ง, และเก็บระยะทางสะสมของสมาชิกแต่ละคน

## ฟีเจอร์หลัก

- รับ webhook จาก LINE OA
- รองรับ flow ส่งผลวิ่งผ่านข้อความและภาพ
- ดาวน์โหลดภาพจาก LINE Messaging API
- OCR อ่านค่าระยะทางจากภาพ Strava, Apple Fitness และ Garmin ด้วย local Tesseract + heuristic parsing
- ถ้า OCR ไม่มั่นใจ ระบบจะให้ผู้ใช้พิมพ์ระยะทางเองแล้วค่อยยืนยัน ไม่ปล่อยให้ flow ตัน
- ให้ผู้ใช้ตรวจสอบ, แก้ไข, ยืนยัน หรือยกเลิกผลวิ่งในแชต
- บันทึกระยะทางรายครั้งและยอดสะสมลงฐานข้อมูล SQLite ผ่าน Prisma
- สร้าง summary card หลังยืนยันผล เพื่อส่งกลับใน LINE
- Admin dashboard สำหรับจัดการทีม ผู้สมัคร maintenance และ admin users

## โครงสร้างหลัก

- `src/routes/webhook.ts` จุดรับ LINE webhook และ logic ของแชต
- `src/services/ocr.service.ts` preprocess ภาพและ OCR ระยะทาง
- `src/services/submission.service.ts` จัดการ pending, confirm, cancel และ aggregate
- `src/services/summary-card.service.ts` สร้างภาพสรุปผลหลังยืนยัน
- `src/services/maintenance.service.ts` backup/export/clear user data และ production stats
- `prisma/schema.prisma` schema ของสมาชิก, ผลวิ่ง, admin users และสถานะการสนทนา

## Production Mapping

ระบบ production ปัจจุบันอยู่บน IBM Cloud Kubernetes และใช้ LINE OA แยกจาก personal account แล้ว

### LINE OA / LINE Developers

- LINE OA display name: `IBMDT Run`
- Basic ID: `@807yrxkb`
- Bot userId: `Ud4f27b3c444602084ec73ce485a82654`
- Messaging API Channel ID: `2010082328`
- LINE Login / LIFF Channel ID: `2010082622`
- LIFF ID: `2010082622-J0OfBHLG`
- Rich menu: `IBMDT Run Menu`

### IBM Cloud

- Region: `jp-tok`
- Cluster ID: `d6a48ret0nfuv0acrpfg`
- Namespace: `sandbox-oxdash`
- Deployment: `lineoa-ibmdtrun`
- Image: `icr.io/sandbox-oxdash/lineoa-ibmdtrun:prod`
- Kubernetes Secret: `lineoa-ibmdtrun-secrets`
- Public URL: `https://lineoa-ibmdtrun-sandbox-oxdash.mycluster-jp-tok-1-bx2-4x-a8fd6d2a2463aad636c736bb6b7a13a1-0000.jp-tok.containers.appdomain.cloud`

Important: อย่า commit ค่า `LINE_CHANNEL_SECRET` หรือ `LINE_CHANNEL_ACCESS_TOKEN` ลง git ค่า production อยู่ใน Kubernetes Secret เท่านั้น

## เริ่มต้นใช้งาน

1. คัดลอก `.env.example` เป็น `.env`
2. กำหนดค่า `BASE_URL`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`
3. ติดตั้งแพ็กเกจ
4. สร้าง Prisma client และฐานข้อมูล
5. รันเซิร์ฟเวอร์

```bash
npm install
npm run prisma:generate
npm run prisma:push
npm run dev
```

## LINE OA ที่ต้องตั้งค่า

- Webhook URL: `https://your-domain.example.com/webhook`
- เปิดใช้ Webhook ใน LINE Developers Console
- ปิด auto-reply ถ้าต้องการให้ bot คุม flow เองทั้งหมด
- LIFF endpoint สำหรับ register: `https://your-domain.example.com/profile`

## หมายเหตุสำคัญ

- `BASE_URL` ต้องเป็น HTTPS ที่ LINE เข้าถึงได้จริง เพราะใช้ส่งรูปกลับผ่าน URL
- ถ้า deploy ด้วย Docker ตาม `docker-compose.yml` ให้ตั้ง `DATABASE_URL=file:./data/dev.db` เพื่อให้ SQLite อยู่ใน volume ถาวร
- OCR ปัจจุบันใช้ `tesseract.js` และ heuristic parsing แบบ conservative โดยไม่รับค่าที่ไม่น่าเป็นไปได้ เช่น มากกว่า 100 กม./ครั้ง
- หาก deploy บน VPS ควรมี reverse proxy เช่น Nginx และ SSL ที่ถูกต้อง

## Admin Authentication

- หน้า `/admin` รองรับ username/password ด้วย session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`)
- API ฝั่งแอดมิน (`/api/admin/*`) ยอมรับ session cookie ที่ผ่านการยืนยันตัวตน
- รองรับ admin users ในฐานข้อมูลผ่านตาราง `AdminUser`
- หน้า `/admin` สามารถสร้าง admin user, แก้ profile, เปิด/ปิดบัญชี, ตั้งรหัสผ่านใหม่ และเปลี่ยนรหัสผ่านตัวเองได้
- `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` ยังใช้เป็น bootstrap/fallback ได้ แต่ควรใช้ DB admin เป็นหลักใน production
- โหมดสำรอง `x-admin-key` ยังเปิดได้ด้วย `ADMIN_ALLOW_API_KEY_FALLBACK=true`
- สร้าง password hash ด้วย `npm run hash:admin-password -- "your-strong-password"`

ตัวแปรที่เกี่ยวข้อง:

- `ADMIN_USERNAME` username สำหรับเข้า admin
- `ADMIN_PASSWORD_HASH` password hash รูปแบบ PBKDF2-SHA256
- `ADMIN_SESSION_SECRET` secret สำหรับ sign session token
- `ADMIN_SESSION_TTL_HOURS` อายุ session (ชั่วโมง)
- `ADMIN_SESSION_IDLE_MINUTES` idle timeout ของ session

## IBM Deploy Flow

ใช้ flow แยก public IBM API กับ private Kubernetes endpoint:

```bash
# VPN off
ibmcloud login --sso
ibmcloud cr login
./scripts/deploy-ibm-lineoa.sh build-push

# VPN on
ibmcloud ks cluster config --cluster d6a48ret0nfuv0acrpfg --endpoint private
./scripts/deploy-ibm-lineoa.sh deploy-app
./scripts/deploy-ibm-lineoa.sh verify
```

ตรวจหลัง deploy:

```bash
curl -fsS https://lineoa-ibmdtrun-sandbox-oxdash.mycluster-jp-tok-1-bx2-4x-a8fd6d2a2463aad636c736bb6b7a13a1-0000.jp-tok.containers.appdomain.cloud/health
curl -fsS https://lineoa-ibmdtrun-sandbox-oxdash.mycluster-jp-tok-1-bx2-4x-a8fd6d2a2463aad636c736bb6b7a13a1-0000.jp-tok.containers.appdomain.cloud/health/db
```

ถ้า `icr.io` หรือ `accounts.cloud.ibm.com` timeout ตอนปิด VPN ให้แก้ network/public route ก่อน push image
