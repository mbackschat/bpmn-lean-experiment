import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Every migration composition must be the whole catalog or a prefix of it.
 *
 * Migration ordinals are global across packages, and the loader requires the ordinals it discovers to
 * be unique and contiguous. That makes an arbitrary multi-package subset invalid by construction: it
 * leaves a gap wherever an unlisted package owns an ordinal. The rule is invisible at any single call
 * site, which is why two tests composed `artifact-store` plus `definitions` and passed for months —
 * until `definitions` gained a second migration numbered above the gap and both broke at once.
 *
 * A single-package composition stays legal only when that package owns the first ordinal, because
 * then the subset is a genuine prefix.
 */

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

const migrationFilePattern = /^(\d{4})_/u;

/** Packages owning migrations, with the ordinals each owns. */
function migrationOwners(): ReadonlyMap<string, ReadonlyArray<number>> {
  const tracked = execFileSync("git", ["ls-files", "platform/*/*/migrations/*.sql"], {
    cwd: projectRoot,
    encoding: "utf8",
  }).split("\n").filter((line) => line.length > 0);
  const owners = new Map<string, number[]>();
  for (const file of tracked) {
    const ordinal = migrationFilePattern.exec(path.basename(file));
    assert.ok(ordinal?.[1] !== undefined, `${file} must carry a four-digit ordinal prefix`);
    const directory = path.dirname(file);
    owners.set(directory, [...(owners.get(directory) ?? []), Number(ordinal[1])]);
  }
  return owners;
}

/**
 * How many real platform migration directories each composition literal names.
 *
 * Only genuine catalog references count. A literal holding a variable for a temporary directory, or
 * a stub path beside an injected discoverer, composes nothing from the catalog and places no
 * requirement here; counting every occurrence of the word instead reported those as empty subsets.
 */
function catalogCompositions(): ReadonlyArray<Readonly<{ file: string; directories: number }>> {
  const tracked = execFileSync("git", ["ls-files", "platform/**/*.ts", "scripts/*.ts"], {
    cwd: projectRoot,
    encoding: "utf8",
  }).split("\n").filter((line) => line.endsWith(".ts") && !line.includes("/dist/"));
  const compositions: Array<{ file: string; directories: number }> = [];
  for (const file of tracked) {
    const body = readFileSync(path.join(projectRoot, file), "utf8");
    for (const [literal] of body.matchAll(/migrationDirectories:\s*\[[\s\S]*?\n\s*\]/gu)) {
      // Quoted paths ending in `/migrations`, because the relative forms walk up out of their own
      // package and share no directory prefix. A literal holding a variable matches none of these.
      const directories = [...literal.matchAll(/"[^"\n]*\/migrations"/gu)].length;
      if (directories > 0) compositions.push({ file, directories });
    }
  }
  return compositions;
}

test("the global ordinal catalog is unique and contiguous from one", () => {
  const owners = migrationOwners();
  const ordinals = [...owners.values()].flat().toSorted((left, right) => left - right);

  assert.ok(ordinals.length > 5, `expected the platform catalog, found ${ordinals.length}`);
  assert.deepEqual(
    ordinals,
    ordinals.map((_, index) => index + 1),
    "platform migration ordinals must be unique and contiguous from 0001 across every package",
  );
});

test("no composition lists an invalid multi-package subset", () => {
  const owners = migrationOwners();
  const complete = owners.size;
  const prefixOwners = new Set(
    [...owners].flatMap(([directory, ordinals]) => ordinals.includes(1) ? [directory] : []),
  );

  assert.equal(prefixOwners.size, 1, "exactly one package owns the first ordinal");
  for (const { file, directories } of catalogCompositions()) {
    // One directory is a prefix composition; the full catalog is always valid. Anything between is
    // a gap, and the loader will refuse it as soon as some unlisted package gains an ordinal.
    assert.ok(
      directories === 1 || directories === complete,
      `${file} composes ${directories} of ${complete} migration directories, which leaves an ordinal gap`,
    );
  }
});

test("the readiness epoch a worker demands matches the catalog it will find", () => {
  const owners = migrationOwners();
  const ordinals = [...owners.values()].flat();
  const finalOrdinal = Math.max(...ordinals);
  const finalMigration = [...owners].flatMap(([directory, owned]) =>
    owned.includes(finalOrdinal) ? [directory] : []
  )[0];
  assert.ok(finalMigration !== undefined);

  // Each migration advances the singleton epoch by one and pins it with a CHECK, so the epoch a
  // correctly migrated database reports is the final ordinal. A worker that demands a stale epoch
  // refuses to start against exactly the schema it was migrated to, which is a production refusal
  // and not merely a failing test.
  const finalSql = execFileSync("git", ["ls-files", `${finalMigration}/*.sql`], {
    cwd: projectRoot,
    encoding: "utf8",
  }).split("\n").filter((line) => line.includes(`/${String(finalOrdinal).padStart(4, "0")}_`))[0];
  assert.ok(finalSql !== undefined, "the final ordinal must have a migration file");
  const pinned = /CHECK \(epoch = (\d+)\)/u.exec(
    readFileSync(path.join(projectRoot, finalSql), "utf8"),
  );
  assert.equal(Number(pinned?.[1]), finalOrdinal, `${finalSql} must pin the epoch it advances to`);

  const readiness = readFileSync(
    path.join(projectRoot, "platform/apps/recovery-worker/src/readiness.ts"),
    "utf8",
  );
  const demanded = /RECOVERY_WORKER_SCHEMA_EPOCH = (\d+)/u.exec(readiness);
  assert.equal(
    Number(demanded?.[1]),
    finalOrdinal,
    "the recovery worker's required schema epoch must equal the catalog's final epoch",
  );
});
