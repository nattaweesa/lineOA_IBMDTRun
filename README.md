# LINE OA IBMDT Run

Backend สำหรับรับผลวิ่งจาก LINE OA, วิเคราะห์ภาพหน้าจอผลวิ่ง, และเก็บระยะทางสะสมของสมาชิกแต่ละคน

## ฟีเจอร์หลัก

- รับ webhook จาก LINE OA
- รองรับ flow ส่งผลวิ่งผ่านข้อความและภาพ
- ดาวน์โหลดภาพจาก LINE Messaging API
- OCR อ่านค่าระยะทางจากภาพ Strava, Apple Fitness และ Garmin
- ให้ผู้ใช้ตรวจสอบ, แก้ไข, ยืนยัน หรือยกเลิกผลวิ่งในแชต
- บันทึกระยะทางรายครั้งและยอดสะสมลงฐานข้อมูล SQLite ผ่าน Prisma
- สร้าง summary card หลังยืนยันผล เพื่อส่งกลับใน LINE

## โครงสร้างหลัก

- `src/routes/webhook.ts` จุดรับ LINE webhook และ logic ของแชต
- `src/services/ocr.service.ts` preprocess ภาพและ OCR ระยะทาง
- `src/services/submission.service.ts` จัดการ pending, confirm, cancel และ aggregate
- `src/services/summary-card.service.ts` สร้างภาพสรุปผลหลังยืนยัน
- `prisma/schema.prisma` schema ของสมาชิก, ผลวิ่ง, และสถานะการสนทนา

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

## หมายเหตุสำคัญ

- `BASE_URL` ต้องเป็น HTTPS ที่ LINE เข้าถึงได้จริง เพราะใช้ส่งรูปกลับผ่าน URL
- ถ้า deploy ด้วย Docker ตาม `docker-compose.yml` ให้ตั้ง `DATABASE_URL=file:./data/dev.db` เพื่อให้ SQLite อยู่ใน volume ถาวร
- OCR ปัจจุบันใช้ `tesseract.js` และ heuristic parsing ถ้าต้องการความแม่นยำสูงขึ้นควรเพิ่มชุดตัวอย่างภาพจริงแล้วปรับ parser ต่อ
- ขณะนี้ยังไม่มี flow สมัครสมาชิกและจัดการทีมแบบเต็มรูปแบบ แต่ schema รองรับ `bibNumber` และ `teamName` ไว้แล้ว
- หาก deploy บน VPS ควรมี reverse proxy เช่น Nginx และ SSL ที่ถูกต้อง

## Admin Authentication (SSO)

- หน้า `/admin` รองรับ Google SSO ด้วย session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`)
- API ฝั่งแอดมิน (`/api/admin/*`) ยอมรับ session cookie ที่ผ่านการยืนยันตัวตน
- โหมดสำรอง `x-admin-key` ยังเปิดได้ด้วย `ADMIN_ALLOW_API_KEY_FALLBACK=true`

ตัวแปรที่เกี่ยวข้อง:

- `GOOGLE_CLIENT_ID` Google OAuth Client ID สำหรับ Sign in
- `ADMIN_ALLOWED_EMAILS` whitelist อีเมลที่อนุญาต (comma-separated)
- `ADMIN_ALLOWED_DOMAINS` whitelist โดเมนอีเมลที่อนุญาต (comma-separated)
- `ADMIN_SESSION_SECRET` secret สำหรับ sign session token
- `ADMIN_SESSION_TTL_HOURS` อายุ session (ชั่วโมง)