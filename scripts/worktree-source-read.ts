import { readFileSync } from "node:fs";

/**
 * Read a worktree source that a concurrent process may have removed since it was enumerated.
 *
 * The guards here list paths in one step and read them in a later one, so a file present at
 * enumeration can be gone by the time it is read. That window is not hypothetical: several guards
 * prove their own discovery by creating and deleting a pending-source probe in the repository root,
 * and `node --test` runs guard files in concurrent processes, so one guard's probe reaches another
 * guard's listing and disappears mid-scan. The resulting `ENOENT` failed a gate that had no defect.
 *
 * A path that no longer exists is by definition not a maintained source, so it is dropped. Any
 * other read failure still throws: a permission or I/O error is a real problem and must not be
 * silently skipped.
 */
export function readWorktreeSource(sourcePath: string): string | null {
  try {
    return readFileSync(sourcePath, "utf8");
  } catch (cause) {
    if (isMissingFile(cause)) {
      return null;
    }
    throw cause;
  }
}

/**
 * Read every path that still exists, dropping the ones that vanished. Use this instead of mapping
 * {@link readWorktreeSource} and filtering, so the drop and the read stay one operation.
 */
export function readWorktreeSources(
  sourcePaths: ReadonlyArray<string>,
): ReadonlyArray<Readonly<{ path: string; source: string }>> {
  return sourcePaths.flatMap((path) => {
    const source = readWorktreeSource(path);
    return source === null ? [] : [{ path, source }];
  });
}

function isMissingFile(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code: unknown }).code === "ENOENT"
  );
}
