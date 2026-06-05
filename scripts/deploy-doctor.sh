#!/usr/bin/env bash
set -u

CLUSTER_ID="${IBM_CLUSTER_ID:-d6a48ret0nfuv0acrpfg}"
NAMESPACE="${K8S_NAMESPACE:-sandbox-oxdash}"
PRIMARY_NET_SERVICE="${PRIMARY_NET_SERVICE:-Wi-Fi}"

IAM_URL="https://iam.cloud.ibm.com"
ACCOUNTS_URL="https://accounts.cloud.ibm.com/v1/accounts"
IDENTITY_URL="https://identity-1.ap-north.iam.cloud.ibm.com/identity/passcode"
ICR_URL="https://icr.io/v2/"

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

print_header() {
  printf "\n# %s\n" "$*"
}

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf "PASS  %s\n" "$*"
}

warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  printf "WARN  %s\n" "$*"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf "FAIL  %s\n" "$*"
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

probe_url() {
  local label="$1"
  local url="$2"
  local output

  if ! has_command curl; then
    fail "curl not found"
    return 1
  fi

  output="$(curl --max-time 20 -sS -o /dev/null -w "${label} %{http_code} connect=%{time_connect} total=%{time_total}" "$url" 2>&1 || true)"
  printf "%s\n" "$output"

  if printf "%s" "$output" | grep -Eqi "timed out|could not resolve|failed to connect|network is unreachable"; then
    fail "${label} route/DNS failed"
    return 1
  fi

  if printf "%s" "$output" | grep -Eq "${label} 000"; then
    fail "${label} returned no HTTP status"
    return 1
  fi

  pass "${label} reachable"
  return 0
}

check_dns() {
  print_header "DNS"

  if ! has_command networksetup; then
    warn "networksetup not found; cannot inspect macOS DNS"
    return
  fi

  local dns
  dns="$(networksetup -getdnsservers "${PRIMARY_NET_SERVICE}" 2>&1 || true)"
  printf "Network service: %s\n" "${PRIMARY_NET_SERVICE}"
  printf "%s\n" "${dns}"

  if printf "%s" "${dns}" | grep -q "AuthorizationCreate() failed"; then
    warn "Could not read DNS because macOS denied permission in this session. Use the suggested commands manually if IBM endpoints timeout."
  elif printf "%s" "${dns}" | grep -Eq "1\.1\.1\.1|8\.8\.8\.8"; then
    pass "DNS includes 1.1.1.1 or 8.8.8.8"
  elif printf "%s" "${dns}" | grep -q "There aren't any DNS Servers"; then
    warn "DNS is automatic. If IBM endpoints timeout, set DNS to 1.1.1.1 and 8.8.8.8."
  else
    warn "DNS does not show 1.1.1.1 or 8.8.8.8. If IBM endpoints timeout, change DNS before Phase A."
  fi

  cat <<'EOF'
Suggested DNS fix:
  sudo networksetup -setdnsservers Wi-Fi 1.1.1.1 8.8.8.8
  sudo dscacheutil -flushcache
  sudo killall -HUP mDNSResponder

Reset DNS to automatic:
  sudo networksetup -setdnsservers Wi-Fi Empty
EOF
}

check_commands() {
  print_header "Required Commands"

  for cmd in ibmcloud docker kubectl curl; do
    if has_command "${cmd}"; then
      pass "${cmd} found"
    else
      fail "${cmd} not found"
    fi
  done
}

check_public() {
  print_header "Phase A Public Endpoints - VPN should be OFF"
  probe_url "IAM" "${IAM_URL}" || true
  probe_url "IDENTITY" "${IDENTITY_URL}" || true
  probe_url "ACCOUNTS" "${ACCOUNTS_URL}" || true
  probe_url "ICR" "${ICR_URL}" || true
}

check_ibmcloud() {
  print_header "IBM Cloud CLI"

  if ! has_command ibmcloud; then
    fail "ibmcloud not found"
    return
  fi

  local target
  target="$(ibmcloud target 2>&1 || true)"
  printf "%s\n" "${target}"

  if printf "%s" "${target}" | grep -q "Not logged in"; then
    warn "ibmcloud is not logged in. Run Phase A with VPN OFF."
  elif printf "%s" "${target}" | grep -q "User:"; then
    pass "ibmcloud appears logged in"
  else
    warn "Could not determine ibmcloud login state"
  fi
}

check_docker() {
  print_header "Docker"

  if ! has_command docker; then
    fail "docker not found"
    return
  fi

  if docker info >/dev/null 2>&1; then
    pass "Docker daemon is running"
  else
    fail "Docker daemon is not reachable. Open Docker Desktop before Phase A build-push."
  fi
}

check_private() {
  print_header "Phase B Kubernetes Private Endpoint - VPN should be ON"

  if ! has_command kubectl; then
    fail "kubectl not found"
    return
  fi

  local server
  server="$(kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}' 2>/dev/null || true)"
  if [ -n "${server}" ]; then
    printf "Current Kubernetes server: %s\n" "${server}"
    if printf "%s" "${server}" | grep -qi "private"; then
      pass "kubeconfig uses private endpoint"
    else
      warn "kubeconfig does not visibly contain private endpoint"
    fi
  else
    warn "No current kubectl server found"
  fi

  if kubectl get pods -n "${NAMESPACE}" --request-timeout=20s >/dev/null 2>&1; then
    pass "kubectl can reach namespace ${NAMESPACE}"
  else
    warn "kubectl cannot reach namespace ${NAMESPACE}. If this is Phase B, turn VPN ON and refresh kubeconfig:"
    printf "      ibmcloud ks cluster config --cluster %s --endpoint private\n" "${CLUSTER_ID}"
  fi
}

summary() {
  print_header "Summary"
  printf "PASS=%s WARN=%s FAIL=%s\n" "${PASS_COUNT}" "${WARN_COUNT}" "${FAIL_COUNT}"

  cat <<'EOF'

Correct deploy order:
  1. Set DNS to 1.1.1.1 / 8.8.8.8 if public endpoints are unstable
  2. VPN OFF
  3. ./scripts/deploy-wizard.sh phase-a
  4. VPN ON
  5. ./scripts/deploy-wizard.sh phase-b

If Phase A fails: fix DNS/public internet. Do not debug Kubernetes manifests.
If Phase B fails: reconnect VPN/private kube access. Do not rebuild image.
EOF
}

mode="${1:-all}"

case "${mode}" in
  all)
    check_commands
    check_dns
    check_public
    check_ibmcloud
    check_docker
    check_private
    summary
    ;;
  public)
    check_dns
    check_public
    check_ibmcloud
    check_docker
    summary
    ;;
  private)
    check_private
    summary
    ;;
  dns)
    check_dns
    summary
    ;;
  *)
    cat <<USAGE
Usage: $0 [all|public|private|dns]

  all      Run every read-only check
  public   Check DNS/public IBM endpoints for Phase A
  private  Check kubectl/private endpoint for Phase B
  dns      Show DNS and suggested fix commands
USAGE
    exit 1
    ;;
esac
