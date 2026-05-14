# LINE OA IBMDT Run - Deployment Configuration & Runbook

## 1. SSH Connection Details

| Setting | Value |
|---------|-------|
| **Host** | 187.77.156.215 |
| **User** | vayurun |
| **Port** | 22 (default) |
| **SSH Key** | ~/.ssh/vayurun_key |

**Quick connect:**
```bash
ssh -i ~/.ssh/vayurun_key vayurun@187.77.156.215
```

**Test connection:**
```bash
ssh -i ~/.ssh/vayurun_key -o ConnectTimeout=10 vayurun@187.77.156.215 'echo ok'
```

---

## 2. Project Paths on VPS

| Path | Purpose |
|------|---------|
| **~/apps/lineoa_ibmdtrun** | Project root (work here) |
| **docker-compose.yml** | Live container orchestration |
| **src/** | TypeScript source code |
| **dist/** | Compiled JavaScript |
| **public/** | Static assets + generated PNGs |
| **data/dev.db** | SQLite production database |
| **prisma/schema.prisma** | Database schema |
| **.env** | Production secrets (NEVER overwrite) |

---

## 3. Deployment Method: SCP + Docker Rebuild

### Upload Method: `scp`
- **Not using:** git pull
- **Not using:** rsync  
- **Using:** scp for targeted file uploads

### Standard Deployment Flow

```bash
# Step 1: Local build verification (on Mac)
cd /Users/Nattawee.S/lineOA_IBMDTRun
npm install
npm run build

# Step 2: Upload modified file to VPS
scp -i ~/.ssh/vayurun_key \
  src/services/summary-card.service.ts \
  vayurun@187.77.156.215:~/apps/lineoa_ibmdtrun/src/services/

# Step 3: SSH into VPS
ssh -i ~/.ssh/vayurun_key vayurun@187.77.156.215

# Step 4: Rebuild and restart container (on VPS)
cd ~/apps/lineoa_ibmdtrun
docker compose up -d --build

# Step 5: Wait for health check
curl --retry 20 --retry-connrefused --retry-delay 1 http://127.0.0.1:3010/health
```

### Docker Commands

```bash
# Build and start
docker compose up -d --build

# View real-time logs
docker logs -f lineoa-ibmdtrun

# View last 50 lines
docker logs --tail 50 lineoa-ibmdtrun

# Stop all containers
docker compose down

# Restart without rebuild
docker compose restart

# Full container status
docker ps -a
```

---

## 4. Production Configuration

### Server & Ports

| Config | Value | Notes |
|--------|-------|-------|
| **Internal Port** | 3010 | Where app listens inside container |
| **External Port (HTTP)** | 80 | Via Caddy reverse proxy |
| **External Port (HTTPS)** | 443 | Via Caddy reverse proxy |

### Environment Variables

**File location:** `~/apps/lineoa_ibmdtrun/.env`

```env
# Server
PORT=3010
BASE_URL=https://ibmdtrun.msoftthai.com

# Database
DATABASE_URL=file:../data/dev.db

# LINE Messaging API (secrets)
LINE_CHANNEL_SECRET=xxxx
LINE_CHANNEL_ACCESS_TOKEN=xxxx

# Admin authentication
ADMIN_SESSION_SECRET=xxxx
ADMIN_GOOGLE_CLIENT_ID=xxxx
ADMIN_ALLOWED_EMAILS=team@msoftthai.com
ADMIN_ALLOWED_DOMAINS=msoftthai.com

# Feature flags
ADMIN_ALLOW_API_KEY_FALLBACK=false
```

**⚠️ CRITICAL:** 
- `.env` is NOT tracked in git
- Do NOT overwrite `.env` when deploying
- Keep SECRET values safe
- Create `.env.example` without secrets for reference

---

## 5. SQLite & Docker Volumes

### Database File

```
Host path:          ~/apps/lineoa_ibmdtrun/data/dev.db
Container path:     /app/data/dev.db
DATABASE_URL:       file:../data/dev.db
Relative to:        prisma/schema.prisma → up one level → ./data/dev.db
```

### Volume Mounts (from docker-compose.yml)

```yaml
volumes:
  - ./data:/app/data                    # SQLite database
  - ./public:/app/public                # Static assets + generated cards
```

**Persistence guarantee:**
- Database persists across container restarts
- Generated PNGs persist across restarts
- Static files (admin.html, register.html) persist

**Do NOT:**
- Delete `./data` folder (contains production database)
- Delete `./public` folder (contains user-generated images)
- Manually edit database file

---

## 6. Reverse Proxy: Caddy

### Proxy Configuration

| Setting | Value |
|---------|-------|
| **Type** | Caddy |
| **Domain** | ibmdtrun.msoftthai.com |
| **Backend** | localhost:3010 (internal) |
| **Protocol** | HTTPS (auto TLS via Let's Encrypt) |
| **SSL Renewal** | Automatic |

### Caddy Config (typical location)

```
/etc/caddy/Caddyfile

ibmdtrun.msoftthai.com {
  reverse_proxy localhost:3010
  encode gzip
  tls <email_for_letsencrypt>
}
```

### Verify Proxy Is Working

```bash
# External test (from Mac)
curl -v https://ibmdtrun.msoftthai.com/health

# Internal test (from VPS)
curl -v http://127.0.0.1:3010/health

# Expected response:
# {"ok":true}
```

---

## 7. Verify Deployment

### Health Check Endpoints

| Endpoint | Access | Expected Response |
|----------|--------|-------------------|
| http://127.0.0.1:3010/health | Internal (VPS only) | `{"ok":true}` |
| https://ibmdtrun.msoftthai.com/health | External (public) | `{"ok":true}` |

### Check Logs (on VPS)

```bash
# Real-time logs
docker logs -f lineoa-ibmdtrun

# Last 100 lines
docker logs --tail 100 lineoa-ibmdtrun

# With timestamps
docker logs -t lineoa-ibmdtrun

# Filter for errors
docker logs lineoa-ibmdtrun | grep -i error
```

### Container Status

```bash
# With inspect details
docker ps -a

# Just container ID and status
docker ps

# Check for restarts/errors
docker inspect lineoa-ibmdtrun | grep -A5 State
```

---

## 8. Rollback Strategy

### Option A: Restore Previous File (Git)

```bash
ssh -i ~/.ssh/vayurun_key vayurun@187.77.156.215

cd ~/apps/lineoa_ibmdtrun

# Check git history
git log --oneline | head -10

# Revert specific file to previous version
git checkout HEAD~1 src/services/summary-card.service.ts

# Rebuild
docker compose up -d --build

# Verify
curl -fsS http://127.0.0.1:3010/health
```

### Option B: Manual Backup Restore

```bash
# From Mac: restore backup of source file
scp -i ~/.ssh/vayurun_key \
  ~/backup/vayu_src/summary-card.service.ts \
  vayurun@187.77.156.215:~/apps/lineoa_ibmdtrun/src/services/

# Rebuild on VPS
ssh -i ~/.ssh/vayurun_key vayurun@187.77.156.215 \
  'cd ~/apps/lineoa_ibmdtrun && docker compose up -d --build'
```

### Option C: Emergency Stop

```bash
ssh -i ~/.ssh/vayurun_key vayurun@187.77.156.215

cd ~/apps/lineoa_ibmdtrun

# Stop container immediately
docker compose down

# Investigate
docker logs lineoa-ibmdtrun | tail -200

# Fix issue and restart
docker compose up -d --build
```

---

## 9. Database Backup & Recovery

### Create Database Backup

```bash
ssh -i ~/.ssh/vayurun_key vayurun@187.77.156.215

cd ~/apps/lineoa_ibmdtrun/data

# Create timestamped backup
cp dev.db dev.db.backup.$(date +%Y%m%d_%H%M%S)

# Verify backup exists
ls -lh dev.db*

# Optional: Copy to Mac for safekeeping
exit

scp -i ~/.ssh/vayurun_key \
  vayurun@187.77.156.215:~/apps/lineoa_ibmdtrun/data/dev.db.backup.* \
  ~/backups/vayu_db/
```

### Restore Database from Backup

```bash
ssh -i ~/.ssh/vayurun_key vayurun@187.77.156.215

cd ~/apps/lineoa_ibmdtrun

# Stop container
docker compose stop

# Restore backup
cp ~/apps/lineoa_ibmdtrun/data/dev.db.backup.20260413_120000 \
   ~/apps/lineoa_ibmdtrun/data/dev.db

# Restart
docker compose up -d

# Verify
docker logs lineoa-ibmdtrun | head -20
```

### Query Database Directly

```bash
ssh -i ~/.ssh/vayurun_key vayurun@187.77.156.215

# Enter container shell
docker exec -it lineoa-ibmdtrun sh

# Inside container, run sqlite3
sqlite3 /app/data/dev.db

# Example queries:
sqlite> SELECT COUNT(*) FROM "User";
sqlite> SELECT COUNT(*) FROM "Submission" WHERE status='CONFIRMED';
sqlite> SELECT name FROM "Team" ORDER BY sortOrder;
sqlite> .tables
sqlite> .quit
```

---

## 10. Quick Reference Commands

### From Mac (Local Development)

```bash
# Test SSH access
ssh -i ~/.ssh/vayurun_key vayurun@187.77.156.215 'echo ok'

# View logs quickly
ssh -i ~/.ssh/vayurun_key vayurun@187.77.156.215 \
  'docker logs --tail 50 lineoa-ibmdtrun'

# Health check
curl -s https://ibmdtrun.msoftthai.com/health | jq .

# Upload file and rebuild (one-liner)
scp -i ~/.ssh/vayurun_key \
  src/services/summary-card.service.ts \
  vayurun@187.77.156.215:~/apps/lineoa_ibmdtrun/src/services/ && \
ssh -i ~/.ssh/vayurun_key vayurun@187.77.156.215 \
  'cd ~/apps/lineoa_ibmdtrun && docker compose up -d --build'
```

### From VPS (After SSH)

```bash
# Navigate to project
cd ~/apps/lineoa_ibmdtrun

# View logs in real-time
docker logs -f lineoa-ibmdtrun

# Check container resources
docker stats lineoa-ibmdtrun

# Disk usage
du -sh data/ public/ dist/

# Database size
ls -lh data/dev.db

# Quick health check
curl -s http://127.0.0.1:3010/health | jq .

# Test API
curl -s http://127.0.0.1:3010/api/public/teams | jq .

# View running services
docker ps
```

---

## 11. Common Issues & Solutions

| Issue | Symptom | Solution |
|-------|---------|----------|
| Container won't start | `docker ps` shows nothing or restarting | `docker logs lineoa-ibmdtrun` - check for Prisma/DB errors |
| Build fails | tsc compilation errors | Run `npm run build` on Mac first, verify it passes locally |
| Health check timeout | `curl` hangs or times out | Container still booting; wait 10-20 seconds and retry |
| Old PNG files visible | Browser shows stale summary card | Clear browser cache (Cmd+Shift+R), file URL should have changed |
| .env variables undefined | App running but missing config | SSH to VPS, verify `.env` exists: `cat .env\|head -5` |
| SSH timeout | Connection drops during upload | Use longer retry: `rsync ... -e "ssh -o ConnectTimeout=30" ...` |
| Database locked | Prisma Error: unable to access database | Restart container: `docker compose restart` |
| Caddy SSL issues | HTTPS fails but HTTP works | Wait for Let's Encrypt renewal or check: `sudo systemctl status caddy` |
| Generated cards not accessible | URL works but 404 | Check volume mount: `ls ~/apps/lineoa_ibmdtrun/public/generated/` |

---

## 12. Pre-Deploy Checklist

**Use before every deployment:**

```markdown
### Pre-Deploy Verification

**Local (on Mac):**
- [ ] Latest code committed
- [ ] `npm run build` passes (no TS errors)
- [ ] No secrets in code
- [ ] SSH key ready: `test -f ~/.ssh/vayurun_key && echo OK`
- [ ] Can reach VPS: `ssh -i ~/.ssh/vayurun_key vayurun@187.77.156.215 'echo ok'`

**Remote (on VPS):**
- [ ] Current logs show no critical errors: `docker logs --tail 20 lineoa-ibmdtrun`
- [ ] Container status normal: `docker ps | grep lineoa`
- [ ] .env file exists: `ls ~/apps/lineoa_ibmdtrun/.env`
- [ ] Database file exists: `ls ~/apps/lineoa_ibmdtrun/data/dev.db`
- [ ] Health check works: `curl http://127.0.0.1:3010/health`

**Team & Planning:**
- [ ] Team notified of deployment
- [ ] Estimated downtime: ~30 seconds (rebuild time)
- [ ] Rollback plan reviewed
- [ ] Database backup taken (optional but recommended)

**Go/No-Go:**
- [ ] All checks above: ✓
- [ ] Decision: [ ] DEPLOY [ ] HOLD
```

---

## 13. Post-Deployment Verification

**After container is rebuilt:**

```bash
# 1. Container status
docker ps | grep lineoa-ibmdtrun

# 2. Check for errors in first 100 lines of logs
docker logs lineoa-ibmdtrun | head -100

# 3. Health endpoint (internal)
curl -v http://127.0.0.1:3010/health

# 4. Health endpoint (external)
curl -v https://ibmdtrun.msoftthai.com/health

# 5. Admin page loads
curl -I https://ibmdtrun.msoftthai.com/admin

# 6. Registration page loads
curl -I https://ibmdtrun.msoftthai.com/profile

# 7. Teams API works
curl -s https://ibmdtrun.msoftthai.com/api/public/teams | jq .

# 8. (Optional) Test with LINE OA
# Send /result command in LINE chat → should receive summary card
```

If all pass: ✅ **Deployment successful**  
If any fail: 🔴 **Trigger rollback immediately**

---

## 14. Maintenance Schedule

### Daily
- Spot-check logs: `docker logs --tail 50 lineoa-ibmdtrun`
- Health URL accessible

### Weekly
- Database size check: `du -sh ~/apps/lineoa_ibmdtrun/data/`
- Generated files growing normally: `du -sh ~/apps/lineoa_ibmdtrun/public/`
- Backup database: `cp ~/apps/lineoa_ibmdtrun/data/dev.db ~/apps/lineoa_ibmdtrun/data/dev.db.weekly`

### Monthly
- Rotate old PNG files if storage > 90%
- Review Caddy certificate renewal status: `sudo systemctl status caddy`
- OS updates available?: `apt update && apt list --upgradable`

### Before Major Release
- Full database backup to Mac
- Full source code backup
- Test rollback procedure
- Notify team of planned downtime

---

**Document Version:** 1.0  
**Last Updated:** April 13, 2026  
**Status:** ✅ Production Ready
