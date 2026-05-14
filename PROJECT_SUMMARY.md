# LINE OA IBMDT Run: Project Summary And VPS Deployment Handoff

## 1. Project Overview

โปรเจกต์นี้เป็น backend สำหรับ LINE OA ใช้รับ webhook, รับภาพผลวิ่ง, ทำ OCR หา distance, ให้ผู้ใช้ยืนยันผลวิ่ง, สะสมระยะทางลงฐานข้อมูล SQLite ผ่าน Prisma, และสร้างภาพสรุปผลวิ่งเพื่อส่งกลับไปใน LINE

ระบบยังมี public/admin web pages สำหรับ registration และ admin management ด้วย

## 2. Confirmed Current Status

ข้อมูลด้านล่างนี้ยืนยันจากโค้ดใน workspace ปัจจุบันแล้ว

- Stack: Node.js 20, TypeScript, Express 4, Prisma, SQLite, sharp, tesseract.js, LINE Messaging API SDK
- Entry point อยู่ที่ `src/index.ts`
- Route หลักอยู่ที่ `src/routes/webhook.ts`
- OCR logic อยู่ที่ `src/services/ocr.service.ts`
- Submission flow อยู่ที่ `src/services/submission.service.ts`
- Summary card renderer อยู่ที่ `src/services/summary-card.service.ts`
- Static files อยู่ใต้ `public/`
- Admin pages มี `public/admin.html` และ `public/admin-login.html`
- Registration page มี `public/register.html`
- Docker deploy ใช้ `docker-compose.yml`
- Container เปิดพอร์ต 3010
- Docker volume mount `./data/public:/app/public` และ `./data/sqlite:/app/data`
- Local build ล่าสุดผ่านแล้วด้วย `npm run build`

## 3. Work Completed In This Session

### 3.1 Summary Card UI/Rendering Work

ไฟล์หลัก: `src/services/summary-card.service.ts`

สิ่งที่มีอยู่ในโค้ดตอนนี้:

- รองรับ summary card 2 variants: `corporate` และ `sport`
- รองรับ numeric font presets: `modern`, `mono`, `thai-clean`, `thai-legacy`
- มี `clampLabel()` สำหรับตัดข้อความยาวเกินพื้นที่
- มี `fitFontSizeByLength()` สำหรับย่อขนาด font อัตโนมัติเมื่อข้อความยาว
- ใช้ sharp render จาก SVG ไปเป็น PNG
- บันทึกไฟล์ไปที่ `public/generated`
- สร้าง URL จาก `BASE_URL`

ผลลัพธ์เชิงหน้าตาในโค้ดปัจจุบัน:

- ลดปัญหาชื่อคนหรือชื่อทีมล้น layout
- ปรับ balance ของ hero metric กับ rank badge
- ปรับ typography อังกฤษให้สะอาดขึ้นใน sport variant

### 3.2 Build/TypeScript Fixes Completed

ไฟล์ที่แก้จริงใน session นี้:

- `tsconfig.json`
- `package.json`

สิ่งที่แก้:

- เปลี่ยน TypeScript ไปใช้ `module` และ `moduleResolution` = `Node16`
- แก้ปัญหา package modern exports เช่น `zod` resolve ไม่ได้
- ปรับ `@types/express` ให้ตรงกับ runtime จริง คือ Express 4
- รัน `npm install` ใหม่ให้ dependency tree ตรงกับ config
- ยืนยันผลด้วย `npm run build` แล้วผ่าน

สาเหตุเดิมที่เจอ:

- tsconfig ใช้ `moduleResolution: Node` แบบเก่า
- type definitions ของ Express ใช้เวอร์ชัน 5 แต่ runtime เป็น Express 4
- ทำให้ editor/build เจอ error จำนวนมากใน `src/routes/webhook.ts`

## 4. Core Application Flow

### 4.1 LINE Submission Flow

1. LINE ส่ง event มาที่ `POST /webhook`
2. ระบบดึงรูปจาก LINE Messaging API
3. OCR วิเคราะห์ภาพเพื่อหา distance และ source app
4. บันทึกเป็น pending submission
5. ผู้ใช้ยืนยันหรือแก้ distance ในแชต
6. ระบบ mark เป็น confirmed
7. ระบบ aggregate total distance ของ user
8. ระบบ generate summary card PNG
9. ส่งภาพ/ข้อความตอบกลับผ่าน LINE

### 4.2 Registration/Admin Flow

Public/Admin routes ที่มีอยู่ในโค้ด:

- `GET /health`
- `GET /debug/submissions`
- `GET /api/public/teams`
- `GET /api/public/config`
- `GET /api/auth/config`
- `GET /api/auth/me`
- `POST /api/auth/google`
- `POST /api/auth/logout`
- `GET /api/public/register-context`
- `GET /api/public/registration`
- `POST /api/register`
- `GET /api/admin/teams`
- `POST /api/admin/teams`
- `PATCH /api/admin/teams/:id`
- `DELETE /api/admin/teams/:id`
- `GET /api/admin/registrations`
- `DELETE /api/admin/registrations/:id`
- `GET /profile`
- `GET /admin/login`
- `GET /admin`

### 4.3 Admin Authentication

ไฟล์หลัก: `src/utils/admin-auth.ts`

ลักษณะระบบ auth:

- ใช้ Google Sign-In ฝั่ง frontend แล้วส่ง token มา backend
- Backend สร้าง signed session cookie ชื่อ `vr_admin_session`
- Cookie เป็น custom signed token ด้วย HMAC SHA-256
- มี fallback `x-admin-key` ได้เมื่อเปิด `ADMIN_ALLOW_API_KEY_FALLBACK=true`

## 5. Database Model Summary

อ้างอิงจาก `prisma/schema.prisma`

### Main Models

- `User`: เก็บ `lineUserId`, ชื่อ, รูป, ทีม, bib, latest distance, total distance
- `Team`: เก็บชื่อทีม, active flag, sort order
- `Registration`: เก็บข้อมูลลงทะเบียนจริงของผู้ใช้ และผูกกับทีม
- `Submission`: เก็บผล OCR, ระยะที่ extract ได้, ระยะที่ confirm แล้ว, สถานะ pending/confirmed/cancelled
- `ConversationState`: เก็บ state การคุยกับ bot ว่ารอการยืนยันหรือแก้ distance อยู่หรือไม่

### Important Enums

- `SubmissionStatus`: `PENDING`, `CONFIRMED`, `CANCELLED`
- `ConversationMode`: `IDLE`, `AWAITING_MANUAL_DISTANCE`

## 6. Important Files To Read First In A New Session

อ่านไฟล์เหล่านี้ก่อนเพื่อเข้าใจระบบเร็วที่สุด:

- `README.md`
- `PROJECT_SUMMARY.md`
- `src/index.ts`
- `src/routes/webhook.ts`
- `src/services/submission.service.ts`
- `src/services/ocr.service.ts`
- `src/services/summary-card.service.ts`
- `src/utils/admin-auth.ts`
- `src/config/env.ts`
- `prisma/schema.prisma`
- `docker-compose.yml`
- `Dockerfile`

## 7. Environment Variables In Use

อ้างอิงจาก `.env.example` และ `src/config/env.ts`

ตัวแปรสำคัญ:

- `PORT`
- `BASE_URL`
- `DATABASE_URL`
- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `ADMIN_API_KEY`
- `ADMIN_ALLOW_API_KEY_FALLBACK`
- `ADMIN_SESSION_SECRET`
- `ADMIN_SESSION_TTL_HOURS`
- `GOOGLE_CLIENT_ID`
- `ADMIN_ALLOWED_EMAILS`
- `ADMIN_ALLOWED_DOMAINS`
- `LIFF_ID`
- `REGISTRATION_TOKEN_SECRET`

หมายเหตุสำคัญ:

- `.env.example` ใช้ค่าตัวอย่าง `BASE_URL=https://ibmdtrun.msoftthai.com`
- Local `.env` ในเครื่องนี้ไม่ควรถูก sync ไปทับของ VPS
- จากบทเรียนใน repo: อย่า overwrite `.env` ฝั่ง VPS เพราะอาจทำให้ `PORT` หรือ secrets เปลี่ยนแล้ว health พัง

## 8. Docker And Persistent Data Notes

จาก `docker-compose.yml`:

- service ชื่อ `lineoa-ibmdtrun`
- start command คือ `sh -c "npx prisma db push && node dist/index.js"`
- เปิดพอร์ต `3010:3010`
- public files ถูก bind mount ออกไปที่ `./data/public`
- sqlite data ถูก bind mount ออกไปที่ `./data/sqlite`

ข้อควรระวัง:

- Static files ใหม่ที่ต้องมีใน production ต้องสอดคล้องกับ volume ที่ mount อยู่ ไม่เช่นนั้นของใน image อาจถูก volume บัง
- สำหรับ SQLite path ใน container ต้องยืนยันให้ตรงกับ schema และ mount path จริงก่อน deploy
- จาก repo memory มีข้อสังเกตว่า path ที่ถูกต้องสำหรับ persistent DB มักต้องเป็น `file:../data/dev.db` เมื่ออิงจาก `prisma/schema.prisma`

## 9. Safe VPS Deployment Checklist

### 9.1 Information That Must Be Confirmed First

ก่อน deploy ต้องยืนยันข้อมูลต่อไปนี้ก่อน:

- SSH host หรือ alias ที่ใช้จริง
- SSH user ที่ใช้จริง
- path โปรเจกต์บน VPS
- วิธี deploy จริง: `git pull`, `scp`, `rsync`, หรือ `docker compose up -d --build`
- ตำแหน่งไฟล์ `.env` ของ production
- ค่า `PORT`, `BASE_URL`, `DATABASE_URL` ฝั่ง production
- reverse proxy ที่ใช้อยู่จริง เช่น Nginx หรือ Caddy
- วิธี rollback ถ้า deploy แล้วพัง

### 9.2 Recommended Deployment Sequence

1. SSH เข้า VPS แบบ read-only ก่อน
2. backup หรือ copy ค่า `.env` ปัจจุบันไว้
3. เช็ก project path และดู `docker-compose.yml` บนเครื่องจริง
4. เช็กค่า `DATABASE_URL` และ path ของ sqlite file
5. sync เฉพาะ source code ที่เปลี่ยน ห้ามทับ `.env`
6. rebuild ด้วย `docker compose up -d --build`
7. เช็ก health ด้วย `curl http://127.0.0.1:3010/health`
8. เช็ก `docker logs lineoa-ibmdtrun`
9. ทดสอบ endpoint หรือ flow ที่แก้จริง

### 9.3 Commands Template

อย่าใช้ตรง ๆ โดยไม่แทนค่า path/host จริงก่อน

```bash
npm install
npm run build

rsync -avz --delete \
  --exclude '.env' \
  --exclude 'node_modules' \
  --exclude 'data' \
  ./ USER@HOST:/path/to/project/

ssh USER@HOST
cd /path/to/project
docker compose up -d --build
curl http://127.0.0.1:3010/health
docker logs --tail 200 lineoa-ibmdtrun
```

## 10. Production Verification Plan

### Basic Checks

- `GET /health` ต้องตอบปกติ
- container ต้องขึ้นครบและไม่ restart loop
- ไม่มี Prisma error เรื่อง DB path
- ไม่มี runtime error เรื่อง fonts, sharp, หรือ LINE SDK

### Functional Checks

- เปิดหน้า `/admin/login` ได้
- เปิดหน้า `/admin` ได้หลัง login
- เปิดหน้า registration ได้
- ดึง `GET /api/public/teams` ได้
- หากทดสอบกับ LINE ได้ ให้ลอง flow ส่งภาพผลวิ่งจริง 1 ครั้ง
- ยืนยันว่า summary card ถูกสร้างใน `public/generated` และเปิด URL ได้จริง

## 11. Known Risks / Open Items

- ข้อมูล SSH host, user, project path บน VPS ยังไม่ถูกยืนยันใน session นี้
- ห้าม deploy จนกว่าจะยืนยัน `.env` และ DB path ฝั่ง production ชัดเจน
- README มีข้อความเก่าเรื่อง `DATABASE_URL=file:./data/dev.db` ซึ่งอาจไม่ตรงกับ path ที่ใช้งานจริงใน container ทุกกรณี ควรตรวจบน VPS ก่อน
- งานใน session นี้ยืนยันแล้วเฉพาะ local build ไม่ได้แตะ production จริง

## 12. Suggested Prompt For The Next Session

```text
โปรเจกต์นี้คือ LINE OA IBMDT Run อยู่ที่ไฟล์ PROJECT_SUMMARY.md

สิ่งที่ทำแล้ว:
- แก้ TypeScript config ให้ build ผ่านแล้ว
- ปรับ package.json ให้ express types ตรงกับ runtime แล้ว
- local npm run build ผ่านแล้ว

ให้คุณอ่านไฟล์เหล่านี้ก่อน:
- README.md
- PROJECT_SUMMARY.md
- src/routes/webhook.ts
- src/services/summary-card.service.ts
- prisma/schema.prisma
- docker-compose.yml

เป้าหมายรอบนี้คือ deploy ขึ้น VPS อย่างปลอดภัย โดยห้ามทับ .env production

ก่อน deploy ให้เช็ก:
- SSH host/user/path จริง
- production .env
- DATABASE_URL ที่ใช้จริง
- docker compose config บน VPS

หลัง deploy ให้ verify:
- /health
- docker logs
- admin page
- registration page
- summary card generation
```

## 13. Status

- Local code status: buildable
- Production deploy status: not executed in this session
- Recommended next action: collect real VPS connection and deployment details, then deploy with verification