import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  assessPlatformProductBoundary,
  packageRootsFromManifests,
  repositoryProductBoundary,
} from "./platform-product-boundary.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("rejects every product-boundary regression class", () => {
  assert.deepEqual(
    assessPlatformProductBoundary([
      {
        path: "platform/modules/definitions/src/upload.ts",
        source: 'import { compile } from "@bpmn-lean/bpmn-source/src/compile.js";',
      },
      {
        path: "packages/semantic-core/src/escape.ts",
        source: 'import { upload } from "../../../platform/modules/definitions/src/upload.js";',
      },
      {
        path: "platform/modules/operate/src/history.ts",
        source: 'import { WorkflowExecutionHistory } from "@temporalio/client";',
      },
      {
        path: "platform/apps/server/src/server.ts",
        source: 'import { helper } from "../../../../showcase/m1-definition-deployment/src/helper.js";',
      },
      {
        path: "platform/apps/web/src/definitions.ts",
        source: 'import { deploy } from "../../../modules/definitions/src/deploy.js";',
      },
      {
        path: "platform/foundation/projection-runtime/src/definitions.ts",
        source: 'import { project } from "../../../modules/definitions/src/project.js";',
      },
      {
        path: "platform/modules/definitions/src/operate.ts",
        source: 'import { retry } from "../../operate/src/retry.js";',
      },
      {
        path: "platform/contracts/src/compile.ts",
        source: 'import { compile } from "../../foundation/engine-gateway/src/compile.js";',
      },
      {
        path: "platform/workers/juel-evaluator/src/definitions.ts",
        source: 'import { deploy } from "../../../modules/definitions/src/deploy.js";',
      },
      {
        path: "platform/misc/src/orphan.ts",
        source: "export const orphan = true;",
      },
      {
        path: "runners/juel/src/worker.ts",
        source: "export class JuelWorker {}",
      },
    ]),
    [
      "packages/semantic-core/src/escape.ts: engine import of product-2 module ../../../platform/modules/definitions/src/upload.js",
      "platform/apps/server/src/server.ts: production import of showcase evidence ../../../../showcase/m1-definition-deployment/src/helper.js",
      "platform/apps/web/src/definitions.ts: disallowed platform dependency ../../../modules/definitions/src/deploy.js",
      "platform/contracts/src/compile.ts: disallowed platform dependency ../../foundation/engine-gateway/src/compile.js",
      "platform/foundation/projection-runtime/src/definitions.ts: disallowed platform dependency ../../../modules/definitions/src/project.js",
      "platform/misc/src/orphan.ts: source outside an approved platform owner",
      "platform/modules/definitions/src/operate.ts: disallowed platform dependency ../../operate/src/retry.js",
      "platform/modules/definitions/src/upload.ts: engine internal import @bpmn-lean/bpmn-source/src/compile.js",
      "platform/modules/operate/src/history.ts: Temporal Event History API reference WorkflowExecutionHistory",
      "platform/workers/juel-evaluator/src/definitions.ts: disallowed platform dependency ../../../modules/definitions/src/deploy.js",
      "runners/juel/src/worker.ts: production JUEL Worker belongs under platform/workers, not runners/juel",
    ],
  );
});

test("permits only explicitly named narrow engine entry points through the gateway", () => {
  const packageRoots = packageRootsFromManifests([
    {
      path: "packages/engine-api/package.json",
      source: '{"name":"@bpmn-lean/engine-api"}',
    },
    {
      path: "packages/temporal-adapter/client/package.json",
      source: '{"name":"@bpmn-lean/temporal-client"}',
    },
  ]);
  const gatewaySources = [
    {
      path: "platform/foundation/engine-gateway/src/compile.ts",
      source: 'import { compile } from "@bpmn-lean/engine-api";',
    },
    {
      path: "platform/foundation/engine-gateway/src/start.ts",
      source: 'import { start } from "@bpmn-lean/temporal-client/definition-start";',
    },
  ] as const;
  assert.deepEqual(
    assessPlatformProductBoundary(gatewaySources, { packageRoots }),
    [
      "platform/foundation/engine-gateway/src/compile.ts: engine internal import @bpmn-lean/engine-api",
      "platform/foundation/engine-gateway/src/start.ts: engine internal import @bpmn-lean/temporal-client/definition-start",
    ],
  );
  assert.deepEqual(
    assessPlatformProductBoundary(
      gatewaySources,
      {
        allowedEngineImports: new Set([
          "@bpmn-lean/engine-api",
          "@bpmn-lean/temporal-client/definition-start",
        ]),
        packageRoots,
      },
    ),
    [],
  );
  assert.deepEqual(
    assessPlatformProductBoundary(
      [{
        path: "platform/workers/juel-evaluator/src/worker.ts",
        source: gatewaySources[0].source,
      }],
      {
        allowedEngineImports: new Set(["@bpmn-lean/engine-api"]),
        packageRoots,
      },
    ),
    [
      "platform/workers/juel-evaluator/src/worker.ts: public engine import outside engine gateway @bpmn-lean/engine-api",
    ],
  );
  assert.deepEqual(
    assessPlatformProductBoundary(
      [{
        path: "platform/apps/server/src/start.ts",
        source: gatewaySources[1].source,
      }],
      {
        allowedEngineImports: new Set([
          "@bpmn-lean/engine-api",
          "@bpmn-lean/temporal-client/definition-start",
        ]),
        packageRoots,
      },
    ),
    [
      "platform/apps/server/src/start.ts: public engine import outside engine gateway @bpmn-lean/temporal-client/definition-start",
    ],
  );
});

test("distinguishes fixture text from executable imports", () => {
  assert.deepEqual(
    assessPlatformProductBoundary([
      {
        path: "packages/semantic-core/test/boundary-fixture.test.ts",
        source: [
          'const fixture = \'import x from "../../../platform/hidden.js";\';',
          '// import x from "../../../platform/comment.js";',
          'const matcher = /import\\s+"platform\\/regex"/u;',
          'const actual = `${await import("../../../platform/actual.js")}`;',
        ].join("\n"),
      },
    ]),
    [
      "packages/semantic-core/test/boundary-fixture.test.ts: engine import of product-2 module ../../../platform/actual.js",
    ],
  );
});

test("applies path-based ownership to exact package names and subpaths", () => {
  const packageRoots = packageRootsFromManifests([
    {
      path: "platform/modules/definitions/package.json",
      source: '{"name":"@bpmn-lean/platform-definitions"}',
    },
    {
      path: "packages/bpmn-source/package.json",
      source: '{"name":"@bpmn-lean/bpmn-source"}',
    },
  ]);
  assert.deepEqual(
    assessPlatformProductBoundary(
      [
        {
          path: "platform/apps/web/src/view.ts",
          source: 'import { deploy } from "@bpmn-lean/platform-definitions/deploy";',
        },
        {
          path: "platform/apps/server/src/server.ts",
          source: 'import { deploy } from "@bpmn-lean/platform-definitions";',
        },
        {
          path: "platform/foundation/engine-gateway/src/compile.ts",
          source: 'import { compile } from "@bpmn-lean/bpmn-source/src/compile.js";',
        },
        {
          path: "packages/semantic-core/src/platform-escape.ts",
          source: 'import { deploy } from "@bpmn-lean/platform-definitions";',
        },
      ],
      { packageRoots },
    ),
    [
      "packages/semantic-core/src/platform-escape.ts: engine import of product-2 module @bpmn-lean/platform-definitions",
      "platform/apps/web/src/view.ts: disallowed platform dependency @bpmn-lean/platform-definitions/deploy",
      "platform/foundation/engine-gateway/src/compile.ts: engine internal import @bpmn-lean/bpmn-source/src/compile.js",
    ],
  );
});

test("lets showcases drive exact public packages while rejecting engine internals", () => {
  const packageRoots = packageRootsFromManifests([
    {
      path: "packages/temporal-adapter/client/package.json",
      source: '{"name":"@bpmn-lean/temporal-client"}',
    },
    {
      path: "packages/temporal-adapter/testkit/package.json",
      source: '{"name":"@bpmn-lean/temporal-testkit"}',
    },
  ]);
  assert.deepEqual(
    assessPlatformProductBoundary([
      {
        path: "showcase/m1-definition-deployment/src/host.ts",
        source: 'import { createCachedLocalEnvironment } from "@bpmn-lean/temporal-testkit";',
      },
      {
        path: "showcase/m1-definition-deployment/src/deep-import.ts",
        source: 'import { start } from "@bpmn-lean/temporal-client/src/process-client.js";',
      },
    ], { packageRoots }),
    [
      "showcase/m1-definition-deployment/src/deep-import.ts: engine internal import @bpmn-lean/temporal-client/src/process-client.js",
    ],
  );
});

test("fails closed for malformed and duplicate package identities", () => {
  assert.throws(
    () => packageRootsFromManifests([{ path: "platform/contracts/package.json", source: "{" }]),
    /platform\/contracts\/package\.json: malformed package\.json/u,
  );
  assert.throws(
    () => packageRootsFromManifests([
      { path: "platform/contracts/package.json", source: '{"name":7}' },
    ]),
    /platform\/contracts\/package\.json: package name must be a string/u,
  );
  assert.throws(
    () => packageRootsFromManifests([
      { path: "platform/contracts/package.json", source: '{"name":"@platform/shared"}' },
      { path: "platform/ui-kit/package.json", source: '{"name":"@platform/shared"}' },
    ]),
    /platform\/ui-kit\/package\.json: duplicate package name @platform\/shared also declared by platform\/contracts\/package\.json/u,
  );
});

test("keeps tracked and pending sources and manifests inside the product boundary", async () => {
  const repository = await repositoryProductBoundary(projectRoot);
  assert.deepEqual(
    assessPlatformProductBoundary(repository.sources, {
      allowedEngineImports: new Set([
        "@bpmn-lean/engine-api",
        "@bpmn-lean/temporal-client/definition-start",
      ]),
      packageRoots: repository.packageRoots,
    }),
    [],
  );
});
