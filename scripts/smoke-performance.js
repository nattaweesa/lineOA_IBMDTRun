const baseUrl = process.env.PERF_BASE_URL || "http://localhost:3000";
const totalUsers = Number(process.env.PERF_USERS || "100");
const concurrency = Number(process.env.PERF_CONCURRENCY || "10");
const prefix = process.env.PERF_PREFIX || `perf-${Date.now()}`;
const timeoutMs = Number(process.env.PERF_REQUEST_TIMEOUT_MS || "15000");
const retries = Number(process.env.PERF_RETRIES || "2");

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(path, options = {}) {
  const started = Date.now();
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      });
      const elapsedMs = Date.now() - started;
      const text = await res.text();
      const body = text ? JSON.parse(text) : {};
      if (!res.ok || body.ok === false) {
        throw new Error(`${options.method || "GET"} ${path} failed ${res.status}: ${text}`);
      }
      return { body, elapsedMs, attempts: attempt + 1 };
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        break;
      }
      await sleep(250 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

async function runPool(items, worker) {
  let nextIndex = 0;
  const results = [];
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const current = items[nextIndex++];
      results.push(await worker(current));
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const health = await requestJson("/health");
  const teamsResponse = await requestJson("/api/public/teams");
  const team = teamsResponse.body.teams && teamsResponse.body.teams[0];
  if (!team) {
    throw new Error("No active team found. Create at least one team before running smoke test.");
  }

  const users = Array.from({ length: totalUsers }, (_, index) => ({
    lineUserId: `U${prefix}${String(index).padStart(5, "0")}`,
    displayName: `Perf ${index + 1}`,
    fullName: `Performance User ${index + 1}`,
    gender: index % 2 === 0 ? "Male" : "Female",
    birthYear: 1990 + (index % 20),
    teamId: team.id,
    source: "perf-smoke",
  }));

  const results = await runPool(users, async (payload) => {
    try {
      const { elapsedMs, attempts } = await requestJson("/api/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return { ok: true, elapsedMs, attempts };
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
  });

  const successes = results.filter((result) => result.ok);
  const failures = results.filter((result) => !result.ok);
  const latencies = successes.map((result) => result.elapsedMs);
  const retried = successes.filter((result) => result.attempts > 1).length;

  console.log(JSON.stringify({
    ok: failures.length === 0,
    baseUrl,
    healthMs: health.elapsedMs,
    totalUsers,
    concurrency,
    timeoutMs,
    retries,
    team: team.name,
    successCount: successes.length,
    failureCount: failures.length,
    retriedSuccessCount: retried,
    latencyMs: {
      min: latencies.length ? Math.min(...latencies) : 0,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.length ? Math.max(...latencies) : 0,
    },
    failures: failures.slice(0, 5),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
