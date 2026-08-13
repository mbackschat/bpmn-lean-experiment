import path from "node:path";

/** Gives every CIB release fresh compiler output so API drift cannot hide behind stale classes. */
export function cibSevenReleaseBuildDirectory(
  runnerDirectory: string,
  release: string,
): string {
  if (!/^\d+\.\d+\.\d+$/u.test(release)) {
    throw new TypeError("CIB Seven release must be an exact semantic version");
  }
  return path.join(runnerDirectory, "target", `verify-${release}`);
}
