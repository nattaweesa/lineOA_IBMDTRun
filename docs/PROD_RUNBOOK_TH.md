# IBMDT Run Production Runbook

## ก่อนประกาศ Public

1. ตรวจ LINE OA
   - Messaging API webhook ต้องเป็น `https://.../webhook`
   - LINE Login channel ต้องเป็น Published
   - LIFF endpoint ต้องเป็น `https://.../profile`
   - Rich menu ปุ่มลงทะเบียนต้องชี้ `https://liff.line.me/<LIFF_ID>`

2. ตรวจ Admin
   - เข้า `/admin` ด้วย username/password ได้
   - หลัง deploy ครั้งแรก ให้สร้าง DB admin user ในหน้า `/admin` ส่วน Admin Users
   - เมื่อ DB admin ใช้งานได้แล้ว สามารถค่อยลดการพึ่งพา env bootstrap admin ในรอบถัดไป
   - `ADMIN_ALLOW_API_KEY_FALLBACK=false`
   - session idle timeout 10 นาที

3. ตรวจข้อมูล
   - prod ต้องไม่มีข้อมูล user เก่าก่อนเปิดจริง
   - team ที่ต้องใช้ต้อง active

## Backup

Backup prod:

```bash
./scripts/prod-backup.sh
```

ค่า default:

- namespace: `sandbox-oxdash`
- app label: `lineoa-ibmdtrun`
- backup path: `/private/tmp/lineoa-ibmdtrun-prod-backups/<timestamp>`

สิ่งที่ backup:

- SQLite: `/app/data/dev.db`
- generated files: `/app/public/generated`
- uploaded files: `/app/public/uploads`

## Restore

```bash
./scripts/prod-restore-backup.sh /private/tmp/lineoa-ibmdtrun-prod-backups/<timestamp>
```

หลัง restore script จะ restart deployment อัตโนมัติ

## Clear User Data ก่อนเปิดระบบจริง

คำสั่งนี้ backup ก่อนลบเสมอ และจะไม่ลบ Team:

```bash
./scripts/prod-clear-user-data.sh
```

ข้อมูลที่ลบ:

- `ConversationState`
- `Submission`
- `Registration`
- `User`
- files ใน `/app/public/uploads`
- files ใน `/app/public/generated`

## Deploy

```bash
./scripts/deploy-ibm-lineoa.sh build-push
./scripts/deploy-ibm-lineoa.sh deploy-app
kubectl rollout restart deployment/lineoa-ibmdtrun -n sandbox-oxdash
kubectl rollout status deployment/lineoa-ibmdtrun -n sandbox-oxdash --timeout=180s
```

ตรวจหลัง deploy:

```bash
curl -fsS https://lineoa-ibmdtrun-sandbox-oxdash.mycluster-jp-tok-1-bx2-4x-a8fd6d2a2463aad636c736bb6b7a13a1-0000.jp-tok.containers.appdomain.cloud/health
curl -fsS https://lineoa-ibmdtrun-sandbox-oxdash.mycluster-jp-tok-1-bx2-4x-a8fd6d2a2463aad636c736bb6b7a13a1-0000.jp-tok.containers.appdomain.cloud/health/db
```

## Performance Smoke Test

ทดสอบ register 100 users ด้วย concurrency 10:

```bash
PERF_BASE_URL=https://lineoa-ibmdtrun-sandbox-oxdash.mycluster-jp-tok-1-bx2-4x-a8fd6d2a2463aad636c736bb6b7a13a1-0000.jp-tok.containers.appdomain.cloud \
PERF_USERS=100 \
PERF_CONCURRENCY=10 \
node scripts/smoke-performance.js
```

หมายเหตุ: script นี้สร้าง registration จริงใน environment ที่ชี้ `PERF_BASE_URL` ดังนั้นถ้าทดสอบบน prod ให้ backup ก่อน และ clear test data หลังจบ

## Maintenance

- เข้า `/admin` แล้วดู Production Maintenance:
  - จำนวน users, registrations, submissions, pending submissions
  - จำนวนไฟล์ uploads/generated
  - in-memory request metrics
  - สร้าง SQLite backup หรือ export DB ได้จากหน้า admin
- API maintenance ต้องใช้ admin session หรือ `x-admin-key` เฉพาะกรณี fallback เปิดอยู่:
  - `GET /api/admin/maintenance/stats`
  - `GET /api/admin/maintenance/metrics`
  - `POST /api/admin/maintenance/backup`
  - `GET /api/admin/maintenance/export-db`
  - `POST /api/admin/maintenance/clear-user-data`
- backup ก่อน deploy ทุกครั้ง
- backup daily ระหว่าง campaign
- ตรวจ `/health` และ `/health/db` หลัง deploy
- ถ้า OCR ช้าหรือ pod CPU สูง ให้ลดการประกาศให้ user ส่งรูปพร้อมกัน หรือเตรียมแยก OCR เป็น worker ใน phase ถัดไป
- ตรวจ PVC usage ระหว่าง campaign เพราะรูป upload และ generated summary จะกินพื้นที่

### Clear user data ผ่าน Admin API

endpoint นี้จะ backup ก่อนล้างเสมอ และเก็บ team config ไว้:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "x-admin-key: <ADMIN_API_KEY>" \
  -d '{"confirm":"CLEAR_USER_DATA","clearFiles":true}' \
  https://<base-url>/api/admin/maintenance/clear-user-data
```

ใน prod แนะนำให้ใช้ admin session จาก browser เป็นหลัก และตั้ง `ADMIN_ALLOW_API_KEY_FALLBACK=false`

## Security Checklist

- LINE channel access token อยู่ใน Kubernetes Secret เท่านั้น
- admin password อยู่ในรูปแบบ hash เท่านั้น
- DB admin users ถูกเก็บในตาราง `AdminUser` พร้อม password hash เท่านั้น
- env `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` ใช้เป็น bootstrap/fallback ได้ แต่ควรจำกัดสิทธิ์และเปลี่ยนเมื่อสงสัยว่ารั่ว
- ไม่ส่ง secret/token ใน chat หรือ commit
- ไม่เปิด API key fallback ใน prod
- ถ้าเปิด `ADMIN_EXPORT_DB_ENABLED=true` ให้จำกัดสิทธิ์ admin และใช้งานเฉพาะช่วง maintenance
- ไม่ log ข้อมูลส่วนตัวเกินจำเป็น
- หากสงสัยว่า password รั่ว ให้เปลี่ยน `ADMIN_PASSWORD_HASH` และ restart deployment
