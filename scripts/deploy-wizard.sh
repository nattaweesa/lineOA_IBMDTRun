#!/usr/bin/env bash
set -euo pipefail

CLUSTER_ID="${IBM_CLUSTER_ID:-d6a48ret0nfuv0acrpfg}"
REGION="${IBM_REGION:-jp-tok}"
NAMESPACE="${K8S_NAMESPACE:-sandbox-oxdash}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOY_SCRIPT="${PROJECT_DIR}/scripts/deploy-ibm-lineoa.sh"

IAM_URL="https://iam.cloud.ibm.com"
ACCOUNTS_URL="https://accounts.cloud.ibm.com/v1/accounts"
ICR_URL="https://icr.io/v2/"

usage() {
  cat <<USAGE
Usage: $0 <command>

Commands:
  doctor             Run read-only deploy diagnosis
  preflight-public   Check public IBM endpoints used while VPN is OFF
  preflight-private  Check Kubernetes private endpoint used while VPN is ON
  phase-a            VPN OFF: login, registry login, build and push image
  phase-b            VPN ON: refresh private kubeconfig, deploy, verify
  status             Show IBM target and Kubernetes resources

Fixed flow:
  Phase A = VPN OFF
    1. ibmcloud login --sso
    2. ibmcloud cr login
    3. ./scripts/deploy-ibm-lineoa.sh build-push

  Phase B = VPN ON
    1. ibmcloud ks cluster config --cluster ${CLUSTER_ID} --endpoint private
    2. ./scripts/deploy-ibm-lineoa.sh deploy-app
    3. ./scripts/deploy-ibm-lineoa.sh verify
USAGE
}

note() {
  printf "\n==> %s\n" "$*"
}

warn() {
  printf "\n!! %s\n" "$*" >&2
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    warn "Missing command: $1"
    exit 1
  fi
}

probe_url() {
  local label="$1"
  local url="$2"
  local output

  output="$(curl --max-time 20 -sS -o /dev/null -w "${label} %{http_code} connect=%{time_connect} total=%{time_total}" "$url" 2>&1 || true)"
  printf "%s\n" "$output"

  if printf "%s" "$output" | grep -Eqi "timed out|could not resolve|failed to connect|network is unreachable"; then
    return 1
  fi

  if printf "%s" "$output" | grep -Eq "${label} 000"; then
    return 1
  fi

  return 0
}

preflight_public() {
  note "Phase A preflight: keep VPN OFF"
  note "Recommended DNS before Phase A: 1.1.1.1 and 8.8.8.8"
  local ok=0
  probe_url "IAM" "${IAM_URL}" || ok=1
  probe_url "ACCOUNTS" "${ACCOUNTS_URL}" || ok=1
  probe_url "ICR" "${ICR_URL}" || ok=1

  if [ "$ok" -ne 0 ]; then
    warn "Public IBM endpoint is not stable yet. Keep VPN OFF and fix network before login/build-push."
    warn "Try DNS 1.1.1.1 / 8.8.8.8, another Wi-Fi/hotspot, retry later, or flush DNS."
    warn "Run: ./scripts/deploy-doctor.sh public"
    exit 2
  fi

  note "Public endpoints are reachable. Continue Phase A with VPN OFF."
}

preflight_private() {
  note "Phase B preflight: VPN must be ON"
  require_command kubectl
  kubectl get pods -n "${NAMESPACE}" --request-timeout=20s >/dev/null
  note "Kubernetes private API is reachable."
}

phase_a() {
  require_command ibmcloud
  require_command docker
  require_command curl

  preflight_public

  note "Running ibmcloud login --sso. Keep VPN OFF."
  ibmcloud login --sso

  note "Targeting region ${REGION}"
  ibmcloud target -r "${REGION}"

  note "Logging in to IBM Container Registry"
  ibmcloud cr region-set global
  ibmcloud cr login

  note "Building and pushing image with ${DEPLOY_SCRIPT}"
  cd "${PROJECT_DIR}"
  "${DEPLOY_SCRIPT}" build-push

  note "Phase A complete. Now turn VPN ON before running: ${0} phase-b"
}

phase_b() {
  require_command ibmcloud
  require_command kubectl

  note "Refreshing private kubeconfig. VPN must be ON."
  ibmcloud ks cluster config --cluster "${CLUSTER_ID}" --endpoint private

  preflight_private

  note "Deploying app"
  cd "${PROJECT_DIR}"
  "${DEPLOY_SCRIPT}" deploy-app

  note "Verifying app"
  "${DEPLOY_SCRIPT}" verify

  note "Phase B complete."
}

status() {
  require_command ibmcloud
  require_command kubectl

  note "IBM Cloud target"
  ibmcloud target || true

  note "Kubernetes current context"
  kubectl config current-context || true

  note "LineOA resources"
  kubectl get deploy,po,svc,ing,pvc -n "${NAMESPACE}" -l app=lineoa-ibmdtrun || true
}

case "${1:-}" in
  doctor)
    "${PROJECT_DIR}/scripts/deploy-doctor.sh" all
    ;;
  preflight-public)
    preflight_public
    ;;
  preflight-private)
    preflight_private
    ;;
  phase-a)
    phase_a
    ;;
  phase-b)
    phase_b
    ;;
  status)
    status
    ;;
  *)
    usage
    exit 1
    ;;
esac
