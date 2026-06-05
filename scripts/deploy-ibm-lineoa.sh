#!/usr/bin/env bash
set -euo pipefail

APP_NAME="lineoa-ibmdtrun"
REGISTRY="${IBM_REGISTRY:-icr.io}"
REGISTRY_NAMESPACE="${IBM_REGISTRY_NAMESPACE:-sandbox-oxdash}"
K8S_NAMESPACE="${K8S_NAMESPACE:-sandbox-oxdash}"
IMAGE_TAG="${IMAGE_TAG:-prod}"
IMAGE="${REGISTRY}/${REGISTRY_NAMESPACE}/${APP_NAME}:${IMAGE_TAG}"
PLATFORM="${PLATFORM:-linux/amd64}"
DEFAULT_HOST="lineoa-ibmdtrun-sandbox-oxdash.mycluster-jp-tok-1-bx2-4x-a8fd6d2a2463aad636c736bb6b7a13a1-0000.jp-tok.containers.appdomain.cloud"
HOST="${IBM_APP_HOST:-$DEFAULT_HOST}"
BASE_URL="${BASE_URL:-https://${HOST}}"
MANIFEST_TEMPLATE="k8s/ibm.yaml"
STORAGE_TEMPLATE="k8s/storage.yaml"
RESTORE_TEMPLATE="k8s/restore-pod.yaml"
RENDERED_MANIFEST="/tmp/${APP_NAME}-ibm.yaml"
RENDERED_STORAGE="/tmp/${APP_NAME}-storage.yaml"
RENDERED_RESTORE="/tmp/${APP_NAME}-restore-pod.yaml"
BACKUP_DIR="${BACKUP_DIR:-/private/tmp/lineoa-ibmdtrun-vps-backup}"

usage() {
  cat <<USAGE
Usage: $0 <command>

Commands:
  build-push       Build Docker image and push to IBM Container Registry
  apply-secret     Create/update Kubernetes secret from environment variables
  render           Render Kubernetes manifest to ${RENDERED_MANIFEST}
  deploy-app       Apply manifest and wait for rollout
  restore-backup   Copy local VPS backup into Kubernetes PVCs
  verify           Show Kubernetes resources and test /health
  logs             Show recent app logs

Environment:
  IBM_REGISTRY_NAMESPACE   default: sandbox-oxdash
  K8S_NAMESPACE            default: sandbox-oxdash
  IMAGE_TAG                default: prod
  IBM_APP_HOST             default: ${DEFAULT_HOST}
  BASE_URL                 default: https://\$IBM_APP_HOST
  BACKUP_DIR               default: /private/tmp/lineoa-ibmdtrun-vps-backup
  PLATFORM                 default: linux/amd64

Required for apply-secret:
  LINE_CHANNEL_SECRET
  LINE_CHANNEL_ACCESS_TOKEN
  ADMIN_SESSION_SECRET
  REGISTRATION_TOKEN_SECRET

Optional for apply-secret:
  LIFF_ID
  GOOGLE_CLIENT_ID
  ADMIN_API_KEY
  ADMIN_USERNAME
  ADMIN_PASSWORD_HASH
  ADMIN_ALLOWED_EMAILS
USAGE
}

require_env() {
  local key="$1"
  if [ -z "${!key:-}" ]; then
    echo "Missing required env: ${key}" >&2
    exit 1
  fi
}

render_manifest() {
  sed \
    -e "s#__NAMESPACE__#${K8S_NAMESPACE}#g" \
    -e "s#__IMAGE__#${IMAGE}#g" \
    -e "s#__HOST__#${HOST}#g" \
    -e "s#__BASE_URL__#${BASE_URL}#g" \
    "${MANIFEST_TEMPLATE}" > "${RENDERED_MANIFEST}"
  echo "Rendered ${RENDERED_MANIFEST}"
}

render_restore() {
  sed -e "s#__NAMESPACE__#${K8S_NAMESPACE}#g" "${STORAGE_TEMPLATE}" > "${RENDERED_STORAGE}"
  sed -e "s#__NAMESPACE__#${K8S_NAMESPACE}#g" "${RESTORE_TEMPLATE}" > "${RENDERED_RESTORE}"
  echo "Rendered ${RENDERED_STORAGE}"
  echo "Rendered ${RENDERED_RESTORE}"
}

case "${1:-}" in
  build-push)
    docker buildx build --platform "${PLATFORM}" -t "${IMAGE}" --push .
    ;;
  apply-secret)
    require_env LINE_CHANNEL_SECRET
    require_env LINE_CHANNEL_ACCESS_TOKEN
    require_env ADMIN_SESSION_SECRET
    require_env REGISTRATION_TOKEN_SECRET
    kubectl create secret generic "${APP_NAME}-secrets" \
      -n "${K8S_NAMESPACE}" \
      --from-literal="LINE_CHANNEL_SECRET=${LINE_CHANNEL_SECRET}" \
      --from-literal="LINE_CHANNEL_ACCESS_TOKEN=${LINE_CHANNEL_ACCESS_TOKEN}" \
      --from-literal="ADMIN_SESSION_SECRET=${ADMIN_SESSION_SECRET}" \
      --from-literal="REGISTRATION_TOKEN_SECRET=${REGISTRATION_TOKEN_SECRET}" \
      --from-literal="LIFF_ID=${LIFF_ID:-}" \
      --from-literal="GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}" \
      --from-literal="ADMIN_API_KEY=${ADMIN_API_KEY:-change-me-now}" \
      --from-literal="ADMIN_USERNAME=${ADMIN_USERNAME:-}" \
      --from-literal="ADMIN_PASSWORD_HASH=${ADMIN_PASSWORD_HASH:-}" \
      --from-literal="ADMIN_ALLOWED_EMAILS=${ADMIN_ALLOWED_EMAILS:-}" \
      --dry-run=client -o yaml | kubectl apply -f -
    ;;
  render)
    render_manifest
    ;;
  deploy-app)
    render_manifest
    kubectl apply -f "${RENDERED_MANIFEST}"
    kubectl rollout status "deployment/${APP_NAME}" -n "${K8S_NAMESPACE}" --timeout=180s
    ;;
  restore-backup)
    render_restore
    kubectl apply -f "${RENDERED_STORAGE}"
    kubectl delete pod "${APP_NAME}-restore" -n "${K8S_NAMESPACE}" --ignore-not-found=true
    kubectl apply -f "${RENDERED_RESTORE}"
    kubectl wait --for=condition=Ready "pod/${APP_NAME}-restore" -n "${K8S_NAMESPACE}" --timeout=120s
    kubectl exec -n "${K8S_NAMESPACE}" "${APP_NAME}-restore" -- sh -c "rm -rf /public/generated /public/uploads && mkdir -p /data /public/generated /public/uploads"
    kubectl cp "${BACKUP_DIR}/sqlite/dev.db" "${K8S_NAMESPACE}/${APP_NAME}-restore:/data/dev.db"
    kubectl cp "${BACKUP_DIR}/generated/." "${K8S_NAMESPACE}/${APP_NAME}-restore:/public/generated"
    kubectl cp "${BACKUP_DIR}/uploads/." "${K8S_NAMESPACE}/${APP_NAME}-restore:/public/uploads"
    kubectl delete pod "${APP_NAME}-restore" -n "${K8S_NAMESPACE}" --ignore-not-found=true
    ;;
  verify)
    kubectl get deploy,po,svc,ing,pvc -n "${K8S_NAMESPACE}" -l "app=${APP_NAME}"
    curl -fsS "${BASE_URL}/health"
    echo
    ;;
  logs)
    kubectl logs -n "${K8S_NAMESPACE}" "deployment/${APP_NAME}" --tail=200
    ;;
  *)
    usage
    exit 1
    ;;
esac
