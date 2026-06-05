#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-lineoa-ibmdtrun}"
K8S_NAMESPACE="${K8S_NAMESPACE:-sandbox-oxdash}"
BACKUP_DIR="${1:-}"

if [ -z "${BACKUP_DIR}" ]; then
  echo "Usage: $0 /path/to/backup-dir" >&2
  exit 1
fi

if [ ! -f "${BACKUP_DIR}/sqlite/dev.db" ]; then
  echo "Missing backup SQLite file: ${BACKUP_DIR}/sqlite/dev.db" >&2
  exit 1
fi

POD="$(kubectl get pods -n "${K8S_NAMESPACE}" -l "app=${APP_NAME}" -o jsonpath='{.items[0].metadata.name}')"
if [ -z "${POD}" ]; then
  echo "No pod found for app=${APP_NAME} in namespace ${K8S_NAMESPACE}" >&2
  exit 1
fi

kubectl cp "${BACKUP_DIR}/sqlite/dev.db" "${K8S_NAMESPACE}/${POD}:/app/data/dev.db"
kubectl exec -n "${K8S_NAMESPACE}" "${POD}" -- sh -c 'rm -rf /app/public/generated/* /app/public/uploads/* && mkdir -p /app/public/generated /app/public/uploads'

if [ -d "${BACKUP_DIR}/generated" ]; then
  kubectl cp "${BACKUP_DIR}/generated/." "${K8S_NAMESPACE}/${POD}:/app/public/generated"
fi
if [ -d "${BACKUP_DIR}/uploads" ]; then
  kubectl cp "${BACKUP_DIR}/uploads/." "${K8S_NAMESPACE}/${POD}:/app/public/uploads"
fi

kubectl rollout restart "deployment/${APP_NAME}" -n "${K8S_NAMESPACE}"
kubectl rollout status "deployment/${APP_NAME}" -n "${K8S_NAMESPACE}" --timeout=180s
echo "Restore complete from ${BACKUP_DIR}"
