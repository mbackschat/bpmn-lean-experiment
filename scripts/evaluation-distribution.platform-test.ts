import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { buildProcessShowcaseCatalog } from "./rc-showcase-catalog.ts";
import { writeEvaluationShowcases } from "./write-evaluation-showcases.ts";

const composePath = new URL("../compose.yaml", import.meta.url);
const dockerfilePath = new URL("../Dockerfile", import.meta.url);
const dockerignorePath = new URL("../.dockerignore", import.meta.url);
const workflowPath = new URL(
  "../.github/workflows/evaluation-distribution.yml",
  import.meta.url,
);
const publishedComposePath = new URL(
  "../deploy/evaluation/published-images.compose.yaml",
  import.meta.url,
);
const publishedLauncherPath = new URL(
  "../deploy/evaluation/demo",
  import.meta.url,
);
const postgresqlRolesPath = new URL(
  "../deploy/evaluation/postgresql/001_roles.sql",
  import.meta.url,
);

test("published bundle prepares exactly the retained interactive human journeys", async () => {
  const projectRoot = fileURLToPath(new URL("..", import.meta.url));
  const bundleRoot = await mkdtemp(path.join(os.tmpdir(), "evaluation-showcases-"));
  try {
    await writeEvaluationShowcases(projectRoot, bundleRoot);
    const catalog = await buildProcessShowcaseCatalog(projectRoot);
    const human = catalog.filter((entry) => entry.showcase?.mode === "human");
    const manifest = await readFile(path.join(bundleRoot, "deploy/evaluation/prepared-human-showcases.txt"), "utf8");
    assert.deepEqual(manifest.trimEnd().split("\n"), human.map((model) =>
      [model.id, model.sourcePath, model.profile, model.sha256].join("|")));
    for (const model of human) {
      assert.equal(await readFile(path.join(bundleRoot, model.sourcePath), "utf8"), model.xml);
    }
  } finally {
    await rm(bundleRoot, { recursive: true, force: true });
  }
});

test("Docker-only launcher admits all prepared human processes and refuses altered source", async () => {
  const projectRoot = fileURLToPath(new URL("..", import.meta.url));
  const temporary = await mkdtemp(path.join(os.tmpdir(), "evaluation-launcher-"));
  const bundleRoot = path.join(temporary, "bundle");
  const launcher = path.join(bundleRoot, "deploy/evaluation/demo");
  const curlLog = path.join(temporary, "curl.log");
  const fakeBin = path.join(temporary, "bin");
  const revision = "a".repeat(40);
  const sourceTree = "b".repeat(64);
  try {
    await writeEvaluationShowcases(projectRoot, bundleRoot);
    await copyFile(fileURLToPath(publishedLauncherPath), launcher);
    await mkdir(fakeBin);
    await writeFile(path.join(fakeBin, "docker"), `#!/bin/sh
if [ "$1" = image ]; then
  case "$4" in
    *source-tree-sha256*) printf '%s\\n' '${sourceTree}' ;;
    *) printf '%s\\n' '${revision}' ;;
  esac
fi
`, { mode: 0o755 });
    await writeFile(path.join(fakeBin, "curl"), `#!/bin/sh
printf '%s\\n' "$*" >> "$EVALUATION_CURL_LOG"
printf '201'
`, { mode: 0o755 });
    const image = (target: string): string =>
      `ghcr.io/mbackschat/bpmn-lean-experiment/evaluation-${target}@sha256:${"c".repeat(64)}`;
    await writeFile(path.join(bundleRoot, "deploy/evaluation/published-images.env"), [
      `BPMN_EVALUATION_SOURCE_REVISION=${revision}`,
      `BPMN_EVALUATION_SOURCE_TREE_SHA256=${sourceTree}`,
      "BPMN_EVALUATION_ORIGIN=http://127.0.0.1:3000",
      `BPMN_EVALUATION_PLATFORM_MIGRATE_IMAGE=${image("platform-migrate")}`,
      `BPMN_EVALUATION_BPMN_WORKER_IMAGE=${image("bpmn-worker")}`,
      `BPMN_EVALUATION_PLATFORM_API_IMAGE=${image("platform-api")}`,
      `BPMN_EVALUATION_PLATFORM_RECOVERY_WORKER_IMAGE=${image("platform-recovery-worker")}`,
    ].join("\n") + "\n");
    const run = () => spawnSync("sh", [launcher, "prepare"], {
      encoding: "utf8", env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH ?? ""}`, EVALUATION_CURL_LOG: curlLog },
    });
    const prepared = run();
    assert.equal(prepared.status, 0, prepared.stderr);
    const catalog = await buildProcessShowcaseCatalog(projectRoot);
    const human = catalog.filter((entry) => entry.showcase?.mode === "human");
    const requests = (await readFile(curlLog, "utf8")).trimEnd().split("\n");
    assert.equal(requests.length, human.length);
    for (const [index, model] of human.entries()) {
      assert.match(requests[index]!, new RegExp(`semanticProfile=${model.profile.replaceAll(".", "\\.")}`, "u"));
      assert.match(prepared.stdout, new RegExp(`PREPARED_HUMAN_SHOWCASE model=${model.id}`, "u"));
    }
    await writeFile(path.join(bundleRoot, human[0]!.sourcePath), "altered source");
    const rejected = run();
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /source differs from its retained digest/u);
    assert.equal((await readFile(curlLog, "utf8")).trimEnd().split("\n").length, human.length);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("evaluation distribution has the closed healthy topology", async () => {
  const compose = await readFile(composePath, "utf8");

  for (const service of [
    "postgresql",
    "temporal",
    "platform-migrate",
    "bpmn-worker",
    "platform-api",
    "platform-recovery-worker",
  ]) {
    assert.match(compose, new RegExp(`^  ${service}:$`, "mu"));
  }
  assert.match(
    serviceBlock(compose, "platform-api"),
    /platform-migrate:\n\s+condition: service_completed_successfully/u,
  );
  assert.match(
    serviceBlock(compose, "platform-recovery-worker"),
    /platform-migrate:\n\s+condition: service_completed_successfully/u,
  );
  assert.doesNotMatch(
    compose,
    /platform-migrate:\n\s+condition: service_started/u,
  );
  assert.match(compose, /^volumes:\n  postgresql-data:\n  temporal-data:$/mu);
  assert.match(
    serviceBlock(compose, "postgresql"),
    /postgresql-data:\/var\/lib\/postgresql/u,
  );
  assert.match(
    serviceBlock(compose, "temporal"),
    /temporal-data:\/var\/lib\/temporal/u,
  );
  assert.match(
    serviceBlock(compose, "temporal"),
    /chown temporal:temporal \/var\/lib\/temporal.*exec su temporal/su,
  );
  assert.match(
    serviceBlock(compose, "platform-api"),
    /"\$\{BPMN_EVALUATION_PORT:-3000\}:3000"/u,
  );
  assert.match(
    serviceBlock(compose, "platform-api"),
    /PLATFORM_PUBLIC_ORIGIN: \$\{BPMN_EVALUATION_ORIGIN:-http:\/\/localhost:3000\}/u,
  );
  assert.match(
    serviceBlock(compose, "platform-api"),
    /PLATFORM_PROJECTION_MAX_AGE_MS: \$\{BPMN_EVALUATION_PROJECTION_MAX_AGE_MS:-30000\}/u,
  );
  assert.match(
    serviceBlock(compose, "platform-recovery-worker"),
    /PLATFORM_PROJECTION_REFRESH_AFTER_MS: \$\{BPMN_EVALUATION_PROJECTION_REFRESH_AFTER_MS:-5000\}/u,
  );
  assert.doesNotMatch(
    serviceBlock(compose, "platform-recovery-worker"),
    /PLATFORM_PROJECTION_MAX_AGE_MS/u,
  );
  assert.doesNotMatch(serviceBlock(compose, "temporal"), /^\s+ports:/mu);
});

test("runtime images contain only deployed production closures", async () => {
  const [dockerfile, dockerignore] = await Promise.all([
    readFile(dockerfilePath, "utf8"),
    readFile(dockerignorePath, "utf8"),
  ]);

  for (const target of [
    "platform-api",
    "platform-recovery-worker",
    "platform-migrate",
    "bpmn-worker",
  ]) {
    const stage = runtimeStage(dockerfile, target);
    assert.match(stage, /COPY --from=packager/u);
    assert.doesNotMatch(stage, /^COPY\s+\.\s/u);
    assert.doesNotMatch(stage, /(?:testkit|showcase|BpmnSemantics|runners\/cibseven|docs\/research)/u);
  }
  assert.match(dockerfile, /--config\.inject-workspace-packages=true/u);
  assert.match(
    dockerfile,
    /^# syntax=docker\/dockerfile:1\.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e$/mu,
  );
  assert.match(dockerfile, /pnpm install --frozen-lockfile --prefer-offline/u);
  assert.doesNotMatch(dockerfile, /deploy .*--legacy/u);
  for (const ignored of [
    "BpmnSemantics",
    ".pnpm-store",
    ".uv-cache",
    "runners",
    "showcase",
    "docs/research",
    "**/test",
    "**/node_modules",
    "**/dist",
  ]) {
    assert.match(dockerignore, new RegExp(`^${escapeRegex(ignored)}$`, "mu"));
  }
});

test("evaluation readiness and fresh setup share one explicitly selected Namespace", async () => {
  const [compose, dockerfile, launcher, workflow] = await Promise.all([
    readFile(composePath, "utf8"), readFile(dockerfilePath, "utf8"),
    readFile(publishedLauncherPath, "utf8"), readFile(workflowPath, "utf8"),
  ]);
  for (const service of ["bpmn-worker", "platform-api", "platform-recovery-worker"]) {
    assert.match(serviceBlock(compose, service), /(?:BPMN|PLATFORM)_TEMPORAL_NAMESPACE: \$\{BPMN_EVALUATION_NAMESPACE:-default\}/u);
  }
  assert.match(serviceBlock(compose, "bpmn-worker"), /8080\/readyz/u);
  assert.match(runtimeStage(dockerfile, "bpmn-worker"), /ENTRYPOINT \["node", "dist\/evaluation-worker-main\.js"\]\nCMD \[\]/u);
  assert.match(launcher, /bpmn-lean-evaluation-published/u);
  assert.match(launcher, /export BPMN_EVALUATION_NAMESPACE/u);
  const prepare = launcher.slice(launcher.indexOf("  prepare)"), launcher.indexOf("  start)"));
  const start = launcher.slice(launcher.indexOf("  start)"), launcher.indexOf("  status)"));
  assert.match(prepare, /compose up --no-build --pull never --wait temporal\n\s+compose run --rm --no-deps --pull never bpmn-worker initialize-fresh-namespace --retention-seconds 86400\n\s+compose up --no-build --pull never --wait/u);
  assert.doesNotMatch(start, /initialize-fresh-namespace/u);
  assert.match(workflow, /BPMN_EVALUATION_NAMESPACE: bpmn-evaluation/u);
  assert.match(workflow, /docker compose run --rm --no-deps bpmn-worker initialize-fresh-namespace --retention-seconds 86400/u);
});

test("project images carry fail-closed demo source provenance", async () => {
  const [compose, dockerfile] = await Promise.all([
    readFile(composePath, "utf8"),
    readFile(dockerfilePath, "utf8"),
  ]);

  assert.match(
    compose,
    /org\.opencontainers\.image\.revision: \$\{BPMN_EVALUATION_SOURCE_REVISION:-unbound\}/u,
  );
  assert.match(
    compose,
    /io\.bpmn-lean\.evaluation\.source-tree-sha256: \$\{BPMN_EVALUATION_SOURCE_TREE_SHA256:-unbound\}/u,
  );
  for (const service of [
    "platform-migrate",
    "bpmn-worker",
    "platform-api",
    "platform-recovery-worker",
  ]) {
    assert.match(serviceBlock(compose, service), /<<: \*project-build/u);
  }
  assert.match(
    dockerfile,
    /org\.opencontainers\.image\.source="https:\/\/github\.com\/mbackschat\/bpmn-lean-experiment"/u,
  );
  assert.match(
    dockerfile,
    /org\.opencontainers\.image\.revision="\$\{BPMN_EVALUATION_SOURCE_REVISION\}"/u,
  );
  assert.match(
    dockerfile,
    /io\.bpmn-lean\.evaluation\.source-tree-sha256="\$\{BPMN_EVALUATION_SOURCE_TREE_SHA256\}"/u,
  );
});

test("published demo bundle replaces every project build with one exact image", async () => {
  const compose = await readFile(publishedComposePath, "utf8");
  const imageVariables = new Map([
    ["platform-migrate", "BPMN_EVALUATION_PLATFORM_MIGRATE_IMAGE"],
    ["bpmn-worker", "BPMN_EVALUATION_BPMN_WORKER_IMAGE"],
    ["platform-api", "BPMN_EVALUATION_PLATFORM_API_IMAGE"],
    ["platform-recovery-worker", "BPMN_EVALUATION_PLATFORM_RECOVERY_WORKER_IMAGE"],
  ]);

  for (const [service, variable] of imageVariables) {
    const block = serviceBlock(compose, service);
    assert.match(
      block,
      new RegExp(
        `${escapeRegex(`image: \${${variable}:?`)}[^}]+${escapeRegex("}")}`,
        "u",
      ),
    );
    assert.match(block, /build: !reset null/u);
  }
  assert.doesNotMatch(compose, /:local/u);
});

test("published demo launcher needs Docker but can never build", async () => {
  const launcher = await readFile(publishedLauncherPath, "utf8");

  assert.match(launcher, /^#!\/bin\/sh$/mu);
  assert.doesNotMatch(launcher, /mue-preview-alpha-native/u);
  assert.match(launcher, /docker compose/u);
  assert.match(launcher, /--no-build/u);
  assert.match(launcher, /--pull never/u);
  assert.match(launcher, /prepare\)/u);
  assert.match(launcher, /start\)/u);
  assert.match(launcher, /status\)/u);
  assert.match(launcher, /stop\)/u);
  assert.match(launcher, /@sha256:\[0-9a-f\]\{64\}/u);
  assert.match(launcher, /prepared-human-showcases\.txt/u);
  assert.match(launcher, /shasum -a 256/u);
  assert.match(launcher, /api\/v1\/definitions\?sourceId=/u);
  assert.doesNotMatch(launcher, /^\. "\$environment_file"$/mu);
  assert.doesNotMatch(launcher, /(?:pnpm|npm|node|git|docker (?:compose )?build)/u);
});

test("evaluation workflow is manual or tagged and never routine", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /^  workflow_dispatch:$/mu);
  assert.match(workflow, /^  push:\n    tags:\n      - "v\*"$/mu);
  assert.match(workflow, /if: github\.ref_type == 'tag'/u);
  assert.match(workflow, /root_version="\$\(jq -r \.version package\.json\)"/u);
  assert.match(workflow, /web_version="\$\(jq -r \.version platform\/apps\/web\/package\.json\)"/u);
  assert.match(workflow, /\[ "\$root_version" != "\$web_version" \] \|\| \[ "\$GITHUB_REF_NAME" != "v\$root_version" \]/u);
  assert.doesNotMatch(workflow, /^  pull_request:/mu);
  assert.doesNotMatch(workflow, /^    branches:/mu);
  assert.match(workflow, /runs-on: ubuntu-latest/u);
  assert.doesNotMatch(workflow, /macos-/u);
  assert.match(workflow, /^      refresh_walkthrough_screenshots:$/mu);
  assert.match(
    workflow,
    /run: \.\/scripts\/pnpm\.sh run walkthrough:screenshots:refresh/u,
  );
  assert.match(
    workflow,
    /path: docs\/assets\/bpm-platform-browser-walkthrough\//u,
  );
  assert.match(
    workflow,
    /uses: docker\/setup-qemu-action@c7c53464625b32c7a7e944ae62b3e17d2b600130 # v3/u,
  );
  assert.match(
    workflow,
    /uses: docker\/setup-buildx-action@8d2750c68a42422c14e847fe6c8ac0403b4cbd6f # v3/u,
  );
  assert.match(workflow, /--platform linux\/amd64,linux\/arm64/u);
  assert.match(workflow, /--tag "\$image:sha-\$GITHUB_SHA"/u);
  assert.match(workflow, /--provenance=mode=max/u);
  assert.match(workflow, /--sbom=true/u);
  assert.match(workflow, /--metadata-file "\$metadata_file"/u);
  assert.match(workflow, /containerimage\.digest/u);
  assert.match(
    workflow,
    /imagetools inspect "\$image:\$image_tag" --format '\{\{json \.Manifest\}\}'/u,
  );
  assert.match(workflow, /jq -er '\.digest'/u);
  assert.doesNotMatch(workflow, /imagetools inspect[^\n]+--raw[^\n]+sha256sum/u);
  assert.match(workflow, /published-images\.env/u);
  assert.match(workflow, /published-images\.compose\.yaml/u);
  assert.match(workflow, /cp docs\/BPM-PLATFORM-BROWSER-WALKTHROUGH\.md/u);
  assert.match(workflow, /scenarios\/expense-exception-review/u);
  assert.match(workflow, /write-evaluation-showcases\.ts/u);
  assert.match(workflow, /contents: write/u);
  assert.match(workflow, /gh release create/u);
  assert.match(workflow, /--verify-tag --prerelease/u);
  assert.doesNotMatch(workflow, /docs\/assets\/mue-preview-alpha-demo/u);
  assert.match(
    workflow,
    /\.artifacts\/mue-evaluation-demo\/deploy\/evaluation\/demo prepare/u,
  );
  assert.doesNotMatch(workflow, /mue-preview-alpha-demo|mue-preview-alpha-native/u);
  assert.match(workflow, /name: mue-evaluation-\$\{\{ github\.ref_type == 'tag' && github\.ref_name \|\| github\.sha \}\}/u);
});

test("manual evaluation respects publishing intent and prepares the publisher toolchain", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const enabled = (name: string, event: string, refType: string, refName: string, publish: boolean, screenshots: boolean): boolean => {
    const step = workflow.split(`      - name: ${name}\n`)[1]?.split("      - name:")[0];
    const condition = step?.match(/^        if: (.+)$/mu)?.[1];
    assert.ok(condition, `missing condition for ${name}`);
    return runInNewContext(condition, {
      github: { event_name: event, ref_type: refType, ref_name: refName },
      inputs: { publish_images: publish, refresh_walkthrough_screenshots: screenshots },
      startsWith: (value: string, prefix: string) => value.startsWith(prefix),
    }, { timeout: 1000 }) as boolean;
  };
  for (const event of ["push", "workflow_dispatch"]) {
    for (const [refType, refName] of [["branch", "main"], ["tag", "phase/mue-release-candidate"], ["tag", "v0.2.0-rc.1"]] as const) {
      if (event === "push" && !refName.startsWith("v")) continue;
      for (const publish of [false, true]) {
        for (const screenshots of [false, true]) {
          const context = [event, refType, refName, publish, screenshots] as const;
          const buildsBundle = enabled("Publish immutable multi-platform evaluation images and bundle", ...context);
          const releases = event === "push" || (publish && refName.startsWith("v"));
          for (const step of ["Verify release tag and displayed product version", "Publish qualified prerelease bundle"]) {
            assert.equal(enabled(step, ...context), releases, `${step}: ${JSON.stringify(context)}`);
          }
          if (buildsBundle) {
            for (const step of ["Resolve pinned toolchain versions", "Set up pnpm", "Set up Node"]) {
              assert.equal(enabled(step, ...context), true, `${step}: publisher needs pinned Node for its TypeScript bundle writer`);
            }
          }
          assert.equal(enabled("Install screenshot Chromium", ...context), event === "push" || screenshots);
        }
      }
    }
  }
});

test("migration and runtime database credentials stay separate", async () => {
  const roles = await readFile(postgresqlRolesPath, "utf8");

  assert.match(roles, /GRANT CREATE ON DATABASE bpmn_platform TO bpmn_migration;/u);
  assert.doesNotMatch(roles, /GRANT CREATE ON DATABASE bpmn_platform TO [^;]*bpmn_runtime/u);
  assert.match(
    roles,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bpmn_runtime;/u,
  );
});

function serviceBlock(compose: string, service: string): string {
  const match = new RegExp(
    `^  ${escapeRegex(service)}:\n(?<body>(?: {4}.*(?:\\n|$))*)`,
    "mu",
  ).exec(compose);
  assert.ok(match?.groups?.body, `missing Compose service ${service}`);
  return match.groups.body;
}

function runtimeStage(dockerfile: string, target: string): string {
  const marker = `FROM runtime-base AS ${target}`;
  const start = dockerfile.indexOf(marker);
  assert.notEqual(start, -1, `missing Docker runtime target ${target}`);
  const next = dockerfile.indexOf("\nFROM ", start + marker.length);
  return dockerfile.slice(start, next === -1 ? undefined : next);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
