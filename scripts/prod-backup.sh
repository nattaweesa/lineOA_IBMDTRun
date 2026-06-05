#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-lineoa-ibmdtrun}"
K8S_NAMESPACE="${K8S_NAMESPACE:-sandbox-oxdash}"
BACKUP_ROOT="${BACKUP_ROOT:-/private/tmp/lineoa-ibmdtrun-prod-backups}"
STAMP="${STAMP:-$(date +%Y%m%d_%H%M%S)}"
OUT_DIR="${BACKUP_ROOT}/${STAMP}"

mkdir -p "${OUT_DIR}/sqlite" "${OUT_DIR}/generated" "${OUT_DIR}/uploads"

POD="$(kubectl get pods -n "${K8S_NAMESPACE}" -l "app=${APP_NAME}" -o jsonpath='{.items[0].metadata.name}')"
if [ -z "${POD}" ]; then
  echo "No pod found for app=${APP_NAME} in namespace ${K8S_NAMESPACE}" >&2
  exit 1
fi

kubectl cp "${K8S_NAMESPACE}/${POD}:/app/data/dev.db" "${OUT_DIR}/sqlite/dev.db"
kubectl cp "${K8S_NAMESPACE}/${POD}:/app/public/generated/." "${OUT_DIR}/generated" || true
kubectl cp "${K8S_NAMESPACE}/${POD}:/app/public/uploads/." "${OUT_DIR}/uploads" || true

cat > "${OUT_DIR}/manifest.txt" <<EOF
app=${APP_NAME}
namespace=${K8S_NAMESPACE}
pod=${POD}
created_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
sqlite=${OUT_DIR}/sqlite/dev.db
generated=${OUT_DIR}/generated
uploads=${OUT_DIR}/uploads
EOF

echo "Backup written to ${OUT_DIR}"
