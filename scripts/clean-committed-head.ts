import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function git(repository: string, arguments_: ReadonlyArray<string>): string {
  const result = spawnSync("git", arguments_, {
    cwd: repository,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${arguments_.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

/** Ensures a pre-push gate verifies the exact committed tree GitHub will check out. */
export function assertCleanCommittedHead(repository: string = projectRoot): void {
  git(repository, ["rev-parse", "--verify", "HEAD^{commit}"]);
  const status = git(repository, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]).trim();
  if (status.length !== 0) {
    throw new Error(
      "pre-push verification requires a clean committed HEAD; commit or remove every tracked and untracked change first",
    );
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    assertCleanCommittedHead();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`CLEAN_COMMITTED_HEAD_ERROR ${message}\n`);
    process.exitCode = 1;
  }
}
