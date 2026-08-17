import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const product2OnlyRootFiles = new Set([
  ".github/workflows/platform-postgresql-quality.yml",
  ".github/workflows/platform-quality.yml",
  ".github/workflows/showcase-quality.yml",
  ".github/workflows/ui-quality.yml",
  "scripts/playwright-loopback-ports.test.ts",
  "scripts/playwright-loopback-ports.ts",
  "tsconfig.platform-harness.json",
  "tsconfig.platform-postgresql-harness.json",
]);

export function requiresProduct1Verification(paths: readonly string[]): boolean {
  return paths.length === 0 || paths.some((path) => !isProduct2OnlyPath(path));
}

function isProduct2OnlyPath(path: string): boolean {
  return path.startsWith("platform/")
    || path.startsWith("showcase/")
    || product2OnlyRootFiles.has(path)
    || /^scripts\/[^/]+\.platform-test\.ts$/u.test(path);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const paths = readFileSync(0, "utf8")
    .split("\n")
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
  process.stdout.write(`product1=${requiresProduct1Verification(paths)}\n`);
}
