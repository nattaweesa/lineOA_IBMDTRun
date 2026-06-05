# AI Agent Handover: LINE OA IBMDT Run

## Current Project

- Workspace: `/Users/Nattawee.S/LineOA_IBMDTRun`
- Git remote: `git@github.com:nattaweesa/lineOA_IBMDTRun.git`
- Runtime: Node.js, TypeScript, Express, Prisma, SQLite, LINE Messaging API SDK, sharp, tesseract.js
- Main app entry: `src/index.ts`
- Main router: `src/routes/webhook.ts`

## Production

Production currently runs on IBM Cloud Kubernetes, not the old VPS.

- IBM region: `jp-tok`
- IKS cluster ID: `d6a48ret0nfuv0acrpfg`
- Namespace: `sandbox-oxdash`
- Deployment: `lineoa-ibmdtrun`
- Image: `icr.io/sandbox-oxdash/lineoa-ibmdtrun:prod`
- Kubernetes Secret: `lineoa-ibmdtrun-secrets`
- Public URL: `https://lineoa-ibmdtrun-sandbox-oxdash.mycluster-jp-tok-1-bx2-4x-a8fd6d2a2463aad636c736bb6b7a13a1-0000.jp-tok.containers.appdomain.cloud`

## LINE OA Mapping

The production LINE OA is separated from the user's personal LINE account.

- LINE OA display name: `IBMDT Run`
- Basic ID: `@807yrxkb`
- Bot userId: `Ud4f27b3c444602084ec73ce485a82654`
- Messaging API Channel ID: `2010082328`
- LINE Login / LIFF Channel ID: `2010082622`
- LIFF ID: `2010082622-J0OfBHLG`
- Rich menu chat bar text: `IBMDT Run Menu`

Do not commit LINE secrets or access tokens. Production secrets live in Kubernetes Secret `lineoa-ibmdtrun-secrets`.

## Recent Features Added Locally

These are the latest local features and should be considered the intended current codebase:

- Production maintenance APIs and admin panel:
  - `/health/db`
  - `/api/admin/maintenance/stats`
  - `/api/admin/maintenance/metrics`
  - `/api/admin/maintenance/backup`
  - `/api/admin/maintenance/export-db`
  - `/api/admin/maintenance/clear-user-data`
- Admin user management in DB:
  - Prisma model `AdminUser`
  - Create admin users
  - Edit display/profile
  - Activate/deactivate admin accounts
  - Set another admin's password
  - Change own password
  - Env admin remains as bootstrap/fallback
- OCR improvements:
  - Multiple local preprocessing variants
  - Conservative candidate scoring
  - Reject implausible one-run distances over 100 km
  - Penalize pace/time/calorie/heart-rate/elevation candidates
  - Manual distance fallback if OCR is not confident
- Security/session hardening:
  - Admin idle timeout
  - Security headers
  - DB health readiness probe in IBM manifest
- Operational scripts:
  - `scripts/deploy-ibm-lineoa.sh`
  - `scripts/prod-backup.sh`
  - `scripts/prod-restore-backup.sh`
  - `scripts/prod-clear-user-data.sh`
  - `scripts/smoke-performance.js`
  - `scripts/deploy-doctor.sh`
  - `scripts/deploy-wizard.sh`

## Deploy Flow

Use VPN only for the private Kubernetes step.

```bash
# VPN off: IBM public API and container registry
ibmcloud login --sso
ibmcloud cr login
./scripts/deploy-ibm-lineoa.sh build-push

# VPN on: private Kubernetes endpoint
ibmcloud ks cluster config --cluster d6a48ret0nfuv0acrpfg --endpoint private
./scripts/deploy-ibm-lineoa.sh deploy-app
./scripts/deploy-ibm-lineoa.sh verify
```

If `accounts.cloud.ibm.com` or `icr.io` timeout while VPN is off, fix network/public route first. If `kubectl` times out, enable the IBM private VPN and refresh kubeconfig.

## Verify

```bash
curl -fsS https://lineoa-ibmdtrun-sandbox-oxdash.mycluster-jp-tok-1-bx2-4x-a8fd6d2a2463aad636c736bb6b7a13a1-0000.jp-tok.containers.appdomain.cloud/health
curl -fsS https://lineoa-ibmdtrun-sandbox-oxdash.mycluster-jp-tok-1-bx2-4x-a8fd6d2a2463aad636c736bb6b7a13a1-0000.jp-tok.containers.appdomain.cloud/health/db
curl -fsS https://lineoa-ibmdtrun-sandbox-oxdash.mycluster-jp-tok-1-bx2-4x-a8fd6d2a2463aad636c736bb6b7a13a1-0000.jp-tok.containers.appdomain.cloud/api/public/config
```

Expected LIFF ID: `2010082622-J0OfBHLG`.

## Git Notes

- Previous local commit before this work: `13102e9 chore: rename app to IBMDT Run and set origin`
- There is an odd untracked file named `" .Destination}}{{end}}'"`; do not include it unless intentionally investigated.
- Run `npm run build` before commit.
- After deploying the latest local code to IBM, commit and push the same code to GitHub so production and repository match.

## Common Pitfalls

- `DATABASE_URL` differs by environment. IBM uses `file:../data/dev.db` from Prisma schema path.
- `npx prisma db push` runs at container startup in IBM manifest.
- Do not overwrite Kubernetes secrets with placeholder `.env` values.
- LINE Login channel must be published, otherwise LIFF may show a 400 developing-status error.
- Rich menu register button should point to `https://liff.line.me/2010082622-J0OfBHLG`, while LIFF endpoint should point to `/profile` on the IBM URL.

