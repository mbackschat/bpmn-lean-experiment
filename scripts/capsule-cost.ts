import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Churn = {
  added: number;
  removed: number;
};

export type CapsuleCost = {
  code: Churn;
  documentation: Churn;
};

const codeExtensions = new Set([
  ".cjs",
  ".java",
  ".js",
  ".kt",
  ".kts",
  ".lean",
  ".mjs",
  ".ts",
  ".tsx",
]);

function measuredKind(
  relativePath: string,
): keyof CapsuleCost | undefined {
  const extension = path.posix.extname(relativePath);
  if (codeExtensions.has(extension)) {
    return "code";
  }
  return extension === ".md" ? "documentation" : undefined;
}

function emptyCost(): CapsuleCost {
  return {
    code: { added: 0, removed: 0 },
    documentation: { added: 0, removed: 0 },
  };
}

export function measureCapsuleDiff(unifiedDiff: string): CapsuleCost {
  const cost = emptyCost();
  let currentKind: keyof CapsuleCost | undefined;
  let insideHunk = false;

  for (const line of unifiedDiff.split("\n")) {
    const fileHeader = line.match(/^diff --git a\/.* b\/(.+)$/u);
    if (fileHeader !== null) {
      currentKind =
        fileHeader[1] === undefined
          ? undefined
          : measuredKind(fileHeader[1]);
      insideHunk = false;
      continue;
    }
    if (line.startsWith("@@")) {
      insideHunk = true;
      continue;
    }
    if (!insideHunk || currentKind === undefined) {
      continue;
    }

    const content = line.slice(1);
    if (content.trim().length === 0) {
      continue;
    }
    if (line.startsWith("+")) {
      cost[currentKind].added += 1;
    } else if (line.startsWith("-")) {
      cost[currentKind].removed += 1;
    }
  }

  return cost;
}

function gitDiff(
  projectRoot: string,
  baseline: string,
  closure: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["diff", "--no-ext-diff", "--unified=0", baseline, closure, "--"],
      {
        cwd: projectRoot,
        encoding: "utf8",
        maxBuffer: 128 * 1024 * 1024,
      },
      (error, stdout) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

async function main(): Promise<void> {
  const [, , baseline, closure] = process.argv;
  if (baseline === undefined || closure === undefined) {
    throw new Error(
      "usage: node scripts/capsule-cost.ts <baseline-commit> <closure-commit>",
    );
  }

  const projectRoot = fileURLToPath(new URL("../", import.meta.url));
  const cost = measureCapsuleDiff(
    await gitDiff(projectRoot, baseline, closure),
  );
  process.stdout.write(
    `${JSON.stringify({ baseline, closure, ...cost }, null, 2)}\n`,
  );
}

const entryPoint = process.argv[1];
if (
  entryPoint !== undefined &&
  import.meta.url === pathToFileURL(entryPoint).href
) {
  await main();
}
