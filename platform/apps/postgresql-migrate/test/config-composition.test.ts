import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  platformPostgresqlMigrationDirectories,
  readPlatformPostgresqlMigrationConfig,
} from "@bpmn-lean/platform-postgresql-migrate";

const projectRoot = fileURLToPath(new URL("../../../..", import.meta.url));
const executablePath = fileURLToPath(new URL("../dist/main.js", import.meta.url));

test("requires the dedicated migration credential without retaining its environment", () => {
  const environment: NodeJS.ProcessEnv = {
    PLATFORM_POSTGRESQL_MIGRATION_URL:
      "postgresql://migration-user:secret@127.0.0.1:5432/platform",
    PLATFORM_POSTGRESQL_URL:
      "postgresql://runtime-user:runtime-secret@127.0.0.1:5432/platform",
  };
  const config = readPlatformPostgresqlMigrationConfig(environment);
  environment.PLATFORM_POSTGRESQL_MIGRATION_URL = "postgresql://attacker.invalid/platform";
  assert.deepEqual(config, {
    connectionString:
      "postgresql://migration-user:secret@127.0.0.1:5432/platform",
  });

  for (const malformed of [undefined, "", "   ", "not-a-url", "https://database.invalid/platform"]) {
    assert.throws(
      () => readPlatformPostgresqlMigrationConfig(
        malformed === undefined
          ? {}
          : { PLATFORM_POSTGRESQL_MIGRATION_URL: malformed },
      ),
      /PLATFORM_POSTGRESQL_MIGRATION_URL/u,
    );
  }
  assert.throws(
    () => readPlatformPostgresqlMigrationConfig({
      PLATFORM_POSTGRESQL_URL:
        "postgresql://runtime-user:runtime-secret@127.0.0.1:5432/platform",
    }),
    /PLATFORM_POSTGRESQL_MIGRATION_URL/u,
  );
  assert.throws(
    () => readPlatformPostgresqlMigrationConfig({
      PLATFORM_POSTGRESQL_MIGRATION_URL: 42,
    } as unknown as NodeJS.ProcessEnv),
    /PLATFORM_POSTGRESQL_MIGRATION_URL/u,
  );
});

test("binds the six migration owners in exact order without consulting cwd", () => {
  const before = platformPostgresqlMigrationDirectories();
  const originalDirectory = process.cwd();
  try {
    process.chdir(path.parse(originalDirectory).root);
    assert.deepEqual(platformPostgresqlMigrationDirectories(), before);
  } finally {
    process.chdir(originalDirectory);
  }
  assert.deepEqual(before, [
    path.join(projectRoot, "platform/foundation/artifact-store/migrations"),
    path.join(projectRoot, "platform/modules/definitions/migrations"),
    path.join(projectRoot, "platform/modules/operate/migrations"),
    path.join(projectRoot, "platform/modules/work/migrations"),
    path.join(projectRoot, "platform/foundation/audit/migrations"),
    path.join(projectRoot, "platform/foundation/recovery-runtime/migrations"),
  ]);
  assert.ok(Object.isFrozen(before));
});

test("fails closed without disclosing a rejected credential", () => {
  const credential = "https://migration-user:do-not-print@database.invalid/platform";
  const result = spawnSync(process.execPath, [executablePath], {
    cwd: path.parse(process.cwd()).root,
    encoding: "utf8",
    env: {
      ...process.env,
      PLATFORM_POSTGRESQL_MIGRATION_URL: credential,
    },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "PostgreSQL migration failed.\n");
  assert.equal(`${result.stdout}${result.stderr}`.includes(credential), false);
  assert.equal(`${result.stdout}${result.stderr}`.includes("do-not-print"), false);
});
