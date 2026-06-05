#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-lineoa-ibmdtrun}"
K8S_NAMESPACE="${K8S_NAMESPACE:-sandbox-oxdash}"
CLEAR_FILES="${CLEAR_FILES:-true}"

POD="$(kubectl get pods -n "${K8S_NAMESPACE}" -l "app=${APP_NAME}" -o jsonpath='{.items[0].metadata.name}')"
if [ -z "${POD}" ]; then
  echo "No pod found for app=${APP_NAME} in namespace ${K8S_NAMESPACE}" >&2
  exit 1
fi

echo "Creating backup before clearing prod user data..."
"$(dirname "$0")/prod-backup.sh"

echo "Counts before clear:"
kubectl exec -n "${K8S_NAMESPACE}" "${POD}" -- node -e '
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const counts = {
    users: await prisma.user.count(),
    registrations: await prisma.registration.count(),
    submissions: await prisma.submission.count(),
    conversationStates: await prisma.conversationState.count(),
    teams: await prisma.team.count(),
  };
  console.log(JSON.stringify(counts, null, 2));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
'

kubectl exec -n "${K8S_NAMESPACE}" "${POD}" -- node -e '
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  await prisma.$transaction([
    prisma.conversationState.deleteMany({}),
    prisma.submission.deleteMany({}),
    prisma.registration.deleteMany({}),
    prisma.user.deleteMany({}),
  ]);
  const counts = {
    users: await prisma.user.count(),
    registrations: await prisma.registration.count(),
    submissions: await prisma.submission.count(),
    conversationStates: await prisma.conversationState.count(),
    teams: await prisma.team.count(),
  };
  console.log(JSON.stringify(counts, null, 2));
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
'

if [ "${CLEAR_FILES}" = "true" ]; then
  echo "Clearing uploaded and generated user files..."
  kubectl exec -n "${K8S_NAMESPACE}" "${POD}" -- sh -c 'rm -rf /app/public/uploads/* /app/public/generated/* && mkdir -p /app/public/uploads /app/public/generated'
fi

echo "Prod user data clear complete. Teams were preserved."
