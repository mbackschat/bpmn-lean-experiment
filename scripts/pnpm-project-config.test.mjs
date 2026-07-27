import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

function configuredVirtualStoreMode(ci) {
  const environment = { ...process.env };
  delete environment.pnpm_config_enable_global_virtual_store;
  delete environment.PNPM_CONFIG_ENABLE_GLOBAL_VIRTUAL_STORE;
  if (ci === undefined) {
    delete environment.CI;
  } else {
    environment.CI = ci;
  }

  return execFileSync(
    "./scripts/pnpm.sh",
    ["config", "get", "enableGlobalVirtualStore"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: environment,
    },
  ).trim();
}

test("pins the repository-local virtual store in ordinary and CI execution", () => {
  assert.equal(configuredVirtualStoreMode(undefined), "false");
  assert.equal(configuredVirtualStoreMode("true"), "false");

  assert.doesNotThrow(() => {
    const environment = { ...process.env };
    delete environment.CI;
    delete environment.pnpm_config_enable_global_virtual_store;
    delete environment.PNPM_CONFIG_ENABLE_GLOBAL_VIRTUAL_STORE;

    execFileSync(
      "./scripts/pnpm.sh",
      ["run", "check:doc-fragments"],
      {
        cwd: projectRoot,
        encoding: "utf8",
        env: environment,
        stdio: "pipe",
      },
    );
  });
});
