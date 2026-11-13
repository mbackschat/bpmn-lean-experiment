import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  installShardEvidence,
  parseShard,
  selectShard,
  shardCases,
  shardEvidencePaths,
  stageShardEvidence,
} from "./cib-evidence-shards.ts";
import type { Shard } from "./cib-evidence-shards.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("reads a shard as a 1-based index within a count and refuses anything else", () => {
  assert.deepEqual(parseShard("1/3"), { index: 1, count: 3 });
  assert.deepEqual(parseShard("3/3"), { index: 3, count: 3 });
  assert.deepEqual(parseShard("1/1"), { index: 1, count: 1 });
  assert.deepEqual(parseShard("12/40"), { index: 12, count: 40 });
  for (const malformed of [
    "", "3", "/3", "1/", "1/3/5", "a/b", "0/3", "1/0", "4/3", "-1/3", "1.5/3", "01/3", "1/03", " 1/3", "1/3 ", "1/3x",
    "1 /3", "99999999999999999999/99999999999999999999",
  ]) {
    assert.throws(() => parseShard(malformed), /--shard needs/u, JSON.stringify(malformed));
  }
});

test("partitions any list into disjoint, complete, order-independent shards that spread neighbours apart", () => {
  const ids = Array.from({ length: 47 }, (_, number) => `family-${String(Math.floor(number / 5))}/scenario-${String(number)}`);
  const shuffled = [...ids].reverse().sort((left, right) => (left.length % 3) - (right.length % 3));
  const key = (id: string): string => id;
  for (let count = 1; count <= 8; count += 1) {
    const shards = Array.from({ length: count }, (_, position) => selectShard(shuffled, key, { index: position + 1, count }));
    assert.deepEqual(shards.flat().sort(), [...ids].sort(), `every id lands in exactly one of ${String(count)} shards`);
    assert.deepEqual(
      shards.map((shard) => selectShard(ids, key, { index: shards.indexOf(shard) + 1, count })),
      shards,
      "the partition does not depend on the input order",
    );
    const sizes = shards.map((shard) => shard.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `sizes ${sizes.join(",")} stay within one`);
    // Round-robin by sorted id: members of one family, adjacent in sorted order, go to different shards.
    const sorted = [...ids].sort();
    for (let position = 0; position + 1 < sorted.length && count > 1; position += 1) {
      const owner = (id: string): number => shards.findIndex((shard) => shard.includes(id));
      assert.notEqual(owner(sorted[position]!), owner(sorted[position + 1]!), `${sorted[position]!} and its successor share a shard`);
    }
  }
});

test("shards the real oracle and population cases into disjoint sets whose union is every case", () => {
  const whole = shardCases(undefined);
  assert.ok(whole.scenarios.length > 100 && whole.populations.length > 0, "the repository retains evidence cases");
  for (const count of [2, 3, 5]) {
    const shards = Array.from({ length: count }, (_, position) => shardCases({ index: position + 1, count }));
    for (const kind of ["scenarios", "populations"] as const) {
      const members = shards.flatMap((shard) => shard[kind].map(({ scenarioRelativePath }) => scenarioRelativePath));
      assert.equal(new Set(members).size, members.length, `${kind} of ${String(count)} shards are disjoint`);
      assert.deepEqual(
        [...members].sort(),
        whole[kind].map(({ scenarioRelativePath }) => scenarioRelativePath).sort(),
        `${kind} of ${String(count)} shards cover every case`,
      );
    }
    assert.deepEqual(shardCases({ index: 2, count }), shards[1], "the partition is deterministic");
  }
});

/** A download as `gh run download` lays it out for several artifacts: one directory per artifact, each holding its shard directory. */
async function downloadOf(scratch: string, shards: ReadonlyArray<Shard>): Promise<string> {
  const download = path.join(scratch, "download");
  for (const { index, count } of shards) {
    await stageShardEvidence({ index, count }, projectRoot, path.join(download, `replaced-cib-evidence-${String(index)}-of-${String(count)}`));
  }
  return download;
}

const shardsOf = (count: number, indexes: ReadonlyArray<number>): ReadonlyArray<Shard> => indexes.map((index) => ({ index, count }));

async function filesUnder(directory: string): Promise<ReadonlyArray<string>> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join("/")).sort();
}

test("stages exactly a shard's own evidence files and installs every shard's files back into one tree", async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), "bpmn-cib-shards-"));
  try {
    const download = await downloadOf(scratch, shardsOf(3, [1, 2, 3]));
    const target = path.join(scratch, "target");
    const installed = await installShardEvidence(download, target);
    const expected = [1, 2, 3].flatMap((index) => shardEvidencePaths({ index, count: 3 })).sort();
    const written = await filesUnder(target);
    assert.equal(installed, written.length);
    // A case with no retained evidence file yet has nothing to stage; every other case's file travels.
    assert.deepEqual(written, expected.filter((relativePath) => existsSync(path.join(projectRoot, relativePath))));
    assert.ok(written.length > 100);
    for (const relativePath of written.slice(0, 25)) {
      assert.deepEqual(await readFile(path.join(target, relativePath)), await readFile(path.join(projectRoot, relativePath)));
    }
    const shardOne = await filesUnder(path.join(download, "replaced-cib-evidence-1-of-3", "shard-1-of-3"));
    const shardOnePartition = new Set(shardEvidencePaths({ index: 1, count: 3 }));
    assert.ok(shardOne.length > 0 && shardOne.every((relativePath) => shardOnePartition.has(relativePath)));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("installs a lone shard whose artifact was extracted without its artifact directory", async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), "bpmn-cib-shards-"));
  try {
    const download = path.join(scratch, "download");
    await stageShardEvidence({ index: 1, count: 1 }, projectRoot, download);
    assert.ok((await installShardEvidence(download, path.join(scratch, "target"))) > 100);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("refuses a shard set that is missing a shard, disagrees on the count, repeats a shard or finds none", async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), "bpmn-cib-shards-"));
  try {
    const target = path.join(scratch, "target");
    const missing = await downloadOf(path.join(scratch, "missing"), shardsOf(3, [1, 3]));
    await assert.rejects(installShardEvidence(missing, target), /shard 2 of 3 is missing/u);

    const disagreeing = await downloadOf(path.join(scratch, "disagree"), [{ index: 1, count: 3 }, { index: 2, count: 4 }]);
    await assert.rejects(installShardEvidence(disagreeing, target), /disagree on the shard count: 3, 4/u);

    const repeated = await downloadOf(path.join(scratch, "repeat"), shardsOf(2, [1, 2]));
    await cp(path.join(repeated, "replaced-cib-evidence-1-of-2"), path.join(repeated, "again"), { recursive: true });
    await assert.rejects(installShardEvidence(repeated, target), /shard 1 of 2 arrives twice/u);

    const empty = path.join(scratch, "empty");
    await mkdir(empty, { recursive: true });
    await assert.rejects(installShardEvidence(empty, target), /no shard-<i>-of-<n> directory/u);

    assert.deepEqual(await readdir(scratch).then((names) => names.includes("target")), false, "a refused set writes nothing");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("refuses a shard that holds a file outside its own partition, writing nothing", async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), "bpmn-cib-shards-"));
  try {
    const download = await downloadOf(scratch, shardsOf(3, [1, 2, 3]));
    const target = path.join(scratch, "target");
    const foreign = shardEvidencePaths({ index: 2, count: 3 })[0]!;
    const intruder = path.join(download, "replaced-cib-evidence-1-of-3", "shard-1-of-3", foreign);
    await mkdir(path.dirname(intruder), { recursive: true });
    await writeFile(intruder, "{}\n", "utf8");
    await assert.rejects(installShardEvidence(download, target), (error: unknown) =>
      error instanceof Error && error.message.includes(`shard 1 of 3 holds ${foreign}`) && /not one of its evidence files/u.test(error.message));

    const stray = path.join(download, "replaced-cib-evidence-1-of-3", "shard-1-of-3", "scenarios", "elsewhere", "notes.txt");
    await rm(intruder);
    await mkdir(path.dirname(stray), { recursive: true });
    await writeFile(stray, "x\n", "utf8");
    await assert.rejects(installShardEvidence(download, target), /holds scenarios\/elsewhere\/notes\.txt/u);
    assert.deepEqual((await readdir(scratch)).includes("target"), false, "a refused set writes nothing");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

const readWorkflow = (name: string): Promise<string> => readFile(path.join(projectRoot, ".github/workflows", name), "utf8");

/** The text of one top-level job of a workflow, up to the next job. */
function jobBlock(workflow: string, job: string): string {
  const block = workflow.match(new RegExp(String.raw`\n {2}${job}:\n((?: {4}.*\n|\n)*)`, "u"))?.[1];
  assert.ok(block !== undefined, `the workflow has a ${job} job`);
  return block;
}

const replayRequested = "github.event_name == 'workflow_dispatch' && inputs.replace_cib_evidence == true";
const shardArgument = String.raw`"\$\{\{ matrix\.shard \}\}/\$\{\{ strategy\.job-total \}\}"`;

test("the hosted replay runs one bounded job per shard and verifies the runtime once, against every shard's evidence", async () => {
  const workflow = await readWorkflow("verify.yml");
  const replay = jobBlock(workflow, "replace_cib_evidence");
  assert.match(replay, new RegExp(String.raw`^ {4}if: ${replayRequested.replaceAll(".", String.raw`\.`)}$`, "mu"));
  assert.match(replay, /^ {4}runs-on: ubuntu-latest$/mu);
  assert.match(replay, /^ {4}timeout-minutes: 20$/mu, "a shard keeps the replay's 20-minute job limit");
  assert.match(replay, /^ {6}fail-fast: false$/mu, "a failed shard never cancels the others, which still upload their evidence");
  const shards = replay.match(/^ {8}shard: \[([0-9, ]+)\]$/mu)?.[1]?.split(",").map(Number);
  assert.ok(shards !== undefined && shards.length >= 2, "the replay is split into several shards");
  assert.deepEqual(shards, shards.map((_, position) => position + 1), "the matrix lists shards 1 to n, once each");
  assert.match(replay, new RegExp(String.raw`run: \./scripts/pnpm\.sh run replace:cib-evidence --shard ${shardArgument}\n`, "u"));
  assert.doesNotMatch(replay, /verify\.sh/u, "a shard never repeats the ordinary runtime verification");
  assert.match(replay, /run: node scripts\/clean-committed-head\.ts\n/u);
  const replace = replay.indexOf("run: ./scripts/pnpm.sh run replace:cib-evidence");
  const stage = replay.match(new RegExp(String.raw`      - name: [^\n]*\n {8}if: always\(\)\n {8}run: node scripts/cib-evidence-shards\.ts stage ${shardArgument} "\$RUNNER_TEMP/([a-z-]+)"\n`, "u"));
  assert.ok(stage?.index !== undefined && stage.index > replace, "a shard stages what it produced after the replay, even when the replay failed");
  assert.match(
    replay,
    new RegExp(String.raw`if: always\(\)\n {8}uses: actions/upload-artifact@\S+ # v4\n {8}with:\n {10}name: replaced-cib-evidence-\$\{\{ matrix\.shard \}\}-of-\$\{\{ strategy\.job-total \}\}\n {10}if-no-files-found: error\n {10}retention-days: 14\n {10}path: \$\{\{ runner\.temp \}\}/${stage?.[1] ?? "missing"}\n`, "u"),
    "every shard uploads its own staged evidence under its own artifact name",
  );

  const runtime = jobBlock(workflow, "verify_runtime");
  assert.match(runtime, /^ {4}needs:\n {6}- changes\n {6}- replace_cib_evidence$/mu);
  assert.match(
    runtime,
    /^ {4}if: needs\.changes\.outputs\.product1 == 'true' && !cancelled\(\) && \(needs\.replace_cib_evidence\.result == 'success' \|\| needs\.replace_cib_evidence\.result == 'skipped'\)$/mu,
    "a failed or cancelled replay never lets the runtime verification pass; a skipped one means no replay was requested",
  );
  assert.doesNotMatch(runtime, /replace:cib-evidence/u, "the runtime job no longer replays evidence itself");
  assert.equal(runtime.match(/run: \.\/scripts\/verify\.sh runtime/gu)?.length, 1);
  const download = runtime.indexOf("run: gh run download \"$GITHUB_RUN_ID\"");
  const install = runtime.indexOf('run: node scripts/cib-evidence-shards.ts install "$RUNNER_TEMP/replaced-cib-evidence"');
  assert.ok(runtime.indexOf("run: node scripts/clean-committed-head.ts") < download && download < install, "evidence is installed after the clean-head binding");
  assert.ok(install < runtime.indexOf("run: ./scripts/verify.sh runtime"), "the runtime is verified against the installed evidence");
  assert.match(runtime, new RegExp(String.raw`if: ${replayRequested.replaceAll(".", String.raw`\.`)}\n {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n {8}run: gh run download "\$GITHUB_RUN_ID" --repo "\$GITHUB_REPOSITORY" --pattern 'replaced-cib-evidence-\*' --dir "\$RUNNER_TEMP/replaced-cib-evidence"\n`, "u"));
  assert.match(runtime, /^ {4}permissions:\n {6}contents: read\n {6}actions: read$/mu, "the download reads this run's artifacts");
  assert.match(runtime, new RegExp(String.raw`if: ${replayRequested.replaceAll(".", String.raw`\.`)}\n {8}run: node scripts/cib-evidence-shards\.ts install`, "u"));
});

test("verify-complete fails when the requested replay did not succeed in every shard", async () => {
  const complete = jobBlock(await readWorkflow("verify.yml"), "verify-complete");
  assert.match(complete, /^ {6}- verify_pipeline\n {6}- replace_cib_evidence$/mu);
  assert.match(complete, /^ {4}if: always\(\)$/mu);
  assert.match(
    complete,
    /test "\$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.replace_cib_evidence == true \}\}" = "false" \|\| test "\$\{\{ needs\.replace_cib_evidence\.result \}\}" = "success"/u,
  );
});

test("the evidence branch installs every shard artifact of the run, so a missing shard fails it", async () => {
  const workflow = await readWorkflow("cib-evidence-branch.yml");
  assert.match(workflow, /gh run download "\$RUN_ID" --repo "\$GITHUB_REPOSITORY" --pattern 'replaced-cib-evidence-\*' --dir "\$RUNNER_TEMP\/evidence"/u);
  assert.match(workflow, /\n {10}node scripts\/cib-evidence-shards\.ts install "\$RUNNER_TEMP\/evidence"\n/u);
  assert.doesNotMatch(workflow, /--name replaced-cib-evidence\b/u);
  assert.doesNotMatch(workflow, /cp -R "\$RUNNER_TEMP\/evidence/u, "the evidence is installed through the shard check, never copied blindly");
});
