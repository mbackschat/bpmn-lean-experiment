import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import pg from "pg";

export const platformPostgresqlSuites = Object.freeze([
  Object.freeze({ label: "runtime", packageName: "@bpmn-lean/platform-postgresql-runtime" }),
  Object.freeze({ label: "artifact", packageName: "@bpmn-lean/platform-artifact-store" }),
  Object.freeze({ label: "definitions", packageName: "@bpmn-lean/platform-definitions" }),
  Object.freeze({ label: "operate", packageName: "@bpmn-lean/platform-operate" }),
  Object.freeze({ label: "work", packageName: "@bpmn-lean/platform-work" }),
  Object.freeze({ label: "audit", packageName: "@bpmn-lean/platform-audit" }),
  Object.freeze({ label: "recovery", packageName: "@bpmn-lean/platform-recovery-runtime" }),
  Object.freeze({ label: "migrate", packageName: "@bpmn-lean/platform-postgresql-migrate" }),
  Object.freeze({ label: "worker", packageName: "@bpmn-lean/platform-recovery-worker" }),
  Object.freeze({ label: "server", packageName: "@bpmn-lean/platform-server" }),
] as const);

export const platformPostgresqlSuiteTimeoutMs = 60_000;

const projectRoot = fileURLToPath(new URL("../../../..", import.meta.url));

export async function runPlatformPostgresqlSuites(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const baseUrl = environment.BPMN_TEST_POSTGRES_URL;
  if (baseUrl === undefined || baseUrl.length === 0) {
    throw new TypeError("BPMN_TEST_POSTGRES_URL is required");
  }
  const admin = new pg.Client({
    connectionString: baseUrl,
    connectionTimeoutMillis: 2_000,
    query_timeout: 5_000,
  });
  await admin.connect();
  try {
    const version = await admin.query<Readonly<{ server_version_num: string }>>(
      "SHOW server_version_num",
    );
    if (!/^18[0-9]{4}$/u.test(version.rows[0]?.server_version_num ?? "")) {
      throw new TypeError("the platform PostgreSQL suites require PostgreSQL 18");
    }
    for (const [index, suite] of platformPostgresqlSuites.entries()) {
      await runIsolatedSuite(admin, baseUrl, suite, index, environment);
    }
  } finally {
    await admin.end();
  }
}

async function runIsolatedSuite(
  admin: pg.Client,
  baseUrl: string,
  suite: (typeof platformPostgresqlSuites)[number],
  index: number,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const databaseName = `bpmn_pg_${index}_${process.pid}_${randomUUID().slice(0, 8)}`;
  if (!/^[a-z0-9_]+$/u.test(databaseName)) {
    throw new TypeError("generated PostgreSQL test database name is unsafe");
  }
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const databaseUrl = new URL(baseUrl);
  databaseUrl.pathname = `/${databaseName}`;
  try {
    await runSuiteProcess(suite, databaseUrl.toString(), environment);
  } finally {
    await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  }
}

async function runSuiteProcess(
  suite: (typeof platformPostgresqlSuites)[number],
  connectionString: string,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      `${projectRoot}/scripts/pnpm.sh`,
      ["--filter", suite.packageName, "run", "test:postgresql:built"],
      {
        cwd: projectRoot,
        env: { ...environment, BPMN_TEST_POSTGRES_URL: connectionString },
        stdio: "inherit",
      },
    );
    let timedOut = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, platformPostgresqlSuiteTimeoutMs);
    child.once("error", (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(deadline);
      if (timedOut) {
        reject(new Error(`PostgreSQL suite ${suite.label} exceeded ${platformPostgresqlSuiteTimeoutMs}ms`));
      } else if (code !== 0) {
        reject(new Error(`PostgreSQL suite ${suite.label} failed with ${signal ?? code}`));
      } else {
        resolve();
      }
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runPlatformPostgresqlSuites().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
