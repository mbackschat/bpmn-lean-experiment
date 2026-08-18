import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseImplementationMapDirectory,
  validateStructuralMapRoutes,
} from "./structural-map-routes.ts";

const rootPath = "docs/IMPLEMENTATION-MAP.md";
const alphaFile = "ALPHA-IMPLEMENTATION-MAP.md";
const betaFile = "BETA-IMPLEMENTATION-MAP.md";

function rootMap(): string {
  return `# Implementation map

## Current claim

Current routing only.

## Routing

| Area ID | State | Detail map | Source-path families |
|---|---|---|---|
| \`ALPHA\` | \`active\` | [Alpha](${alphaFile}) | \`alpha/\` |
| \`BETA\` | \`deferred\` | [Beta](${betaFile}) | \`beta/\` |

## Cross-area invariants

Shared invariant.
`;
}

function detailMap(name: string, extra = ""): string {
  return `# ${name}

## Current boundary

Current boundary.

## Implemented

Implemented facts.

## Explicitly absent

Absent facts.

## Evidence owners

Evidence facts.

## Nearest unsupported claims

Unsupported facts.
${extra}`;
}

function plan(maps = `[alpha](${alphaFile}), [beta](${betaFile})`, action = "Continue work."): string {
  return `# Plan

## Ordered work

1. \`WORK\` · **active** · Owner: [owner](OWNER.md) · Maps: ${maps} · Action: ${action}
`;
}

function registry(extra = ""): string {
  return `# Documentation

## Registry

| Document | Purpose |
|---|---|
| [Implementation map](IMPLEMENTATION-MAP.md) | Router |
| [Alpha](${alphaFile}) | Alpha status |
| [Beta](${betaFile}) | Beta status |
${extra}`;
}

function claude(step = "2. Read root [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md) completely."): string {
  return `# Guide

## Start every session

1. Read the plan.
${step}
3. Resolve the work.
`;
}

function validDocuments(): Map<string, string> {
  return new Map([
    [rootPath, rootMap()],
    [`docs/${alphaFile}`, detailMap("Alpha")],
    [`docs/${betaFile}`, detailMap("Beta")],
    ["docs/PLAN.md", plan()],
    ["docs/README.md", registry()],
    ["CLAUDE.md", claude()],
    [
      "docs/NOTE.md",
      "[`implementation-status-router`](IMPLEMENTATION-MAP.md) and [`implementation-status-owner:ALPHA`](ALPHA-IMPLEMENTATION-MAP.md#current-boundary) are local routes.\n",
    ],
  ]);
}

function errors(documents: ReadonlyMap<string, string>): ReadonlyArray<string> {
  return validateStructuralMapRoutes(documents);
}

function expectError(documents: ReadonlyMap<string, string>, pattern: RegExp): void {
  const actual = errors(documents);
  assert.ok(actual.some((message) => pattern.test(message)), actual.join("\n"));
}

function setDocument(
  documents: ReadonlyMap<string, string>,
  path: string,
  markdown: string,
): Map<string, string> {
  return new Map([...documents, [path, markdown]]);
}

test("parses the exact root Routing table as the only detail-map directory", () => {
  const result = parseImplementationMapDirectory(rootMap());
  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    [...result.directory].map(([id, entry]) => [id, entry.state, entry.path]),
    [
      ["ALPHA", "active", `docs/${alphaFile}`],
      ["BETA", "deferred", `docs/${betaFile}`],
    ],
  );

  for (const broken of [
    rootMap().replace("| Area ID | State | Detail map | Source-path families |", "| Area | State | Detail map | Source-path families |"),
    rootMap().replace("`active`", "`unknown`"),
    rootMap().replace(`| \`BETA\` |`, "| `ALPHA` |"),
    rootMap().replace(`](${betaFile})`, `](${alphaFile})`),
    rootMap().replace(`](${alphaFile})`, `](${alphaFile}#current-boundary)`),
    rootMap().replace("| `alpha/` |", `| \`alpha/\` and [wrong](${betaFile}) |`),
  ]) {
    assert.notDeepEqual(parseImplementationMapDirectory(broken).errors, []);
  }
});

test("accepts a complete structural route universe without English inference", () => {
  assert.deepEqual(errors(validDocuments()), []);
});

test("does not let unrelated valid routing text launder stale root ownership", () => {
  const documents = validDocuments();
  documents.set(
    "docs/NOTE.md",
    "[`implementation-status-router`](IMPLEMENTATION-MAP.md) routes navigation. Current status stays in [the root](IMPLEMENTATION-MAP.md).\n",
  );
  expectError(documents, /NOTE\.md.*route atom/u);
});

test("rejects bare map paths independent of conjunction and colon punctuation", () => {
  for (const prose of [
    "Routing is valid, and status is in IMPLEMENTATION-MAP.md.\n",
    "Status owner: ALPHA-IMPLEMENTATION-MAP.md.\n",
  ]) {
    const documents = validDocuments();
    documents.set("docs/NOTE.md", prose);
    expectError(documents, /NOTE\.md.*bare implementation-map path/u);
  }
});

test("rejects unregistered implementation-map links and bare paths", () => {
  const linked = validDocuments();
  linked.set("docs/NOTE.md", "[unknown](UNKNOWN-IMPLEMENTATION-MAP.md)\n");
  expectError(linked, /NOTE\.md.*route atom/u);

  const bare = validDocuments();
  bare.set("docs/NOTE.md", "UNKNOWN-IMPLEMENTATION-MAP.md\n");
  expectError(bare, /NOTE\.md.*bare implementation-map path/u);
});

test("PLAN consumes only ordinary comma-separated detail links inside Maps", () => {
  const documents = validDocuments();
  documents.set("docs/PLAN.md", plan(undefined, `Continue through [beta](${betaFile}).`));
  expectError(documents, /PLAN\.md.*outside.*Maps/u);

  documents.set("docs/PLAN.md", plan(`[alpha](${alphaFile}) trailing, [beta](${betaFile})`));
  expectError(documents, /PLAN\.md.*Maps/u);
});

test("validates every role target, fragment, syntax, and duplicate scope", () => {
  const cases: ReadonlyArray<readonly [string, RegExp]> = [
    ["[`implementation-status-router`](ALPHA-IMPLEMENTATION-MAP.md)", /router.*root/u],
    ["[`implementation-status-root-owner`](IMPLEMENTATION-MAP.md)", /root-owner.*fragment/u],
    ["[`implementation-status-root-owner`](IMPLEMENTATION-MAP.md#routing)", /non-Routing/u],
    ["[`implementation-status-owner:UNKNOWN`](ALPHA-IMPLEMENTATION-MAP.md)", /unknown area/u],
    ["[`implementation-status-owner:ALPHA`](BETA-IMPLEMENTATION-MAP.md)", /target/u],
    ["[`implementation-status-owner:ALPHA`](ALPHA-IMPLEMENTATION-MAP.md#missing)", /missing fragment/u],
    ["[`implementation-status-owner:ALPHA`](ALPHA-IMPLEMENTATION-MAP.md?x=1)", /query/u],
    ["[`implementation-status-owner:ALPHA`](<ALPHA-IMPLEMENTATION-MAP.md>)", /angle/u],
    ["[`implementation-status-owner:ALPHA`](ALPHA-IMPLEMENTATION-MAP.md \"title\")", /title/u],
    ["![`implementation-status-owner:ALPHA`](ALPHA-IMPLEMENTATION-MAP.md)", /image/u],
    ["[\\`implementation-status-owner:ALPHA`](ALPHA-IMPLEMENTATION-MAP.md)", /escaped/u],
    ["[`implementation-status-owner:ALPHA`](nested%2FALPHA-IMPLEMENTATION-MAP.md)", /encoded path separator/u],
    ["[`implementation-status-owner:ALPHA`](ALPHA-IMPLEMENTATION-MAP.md) and [`implementation-status-owner:ALPHA`](ALPHA-IMPLEMENTATION-MAP.md)", /duplicate.*container/u],
  ];
  for (const [route, pattern] of cases) {
    const documents = validDocuments();
    documents.set("docs/NOTE.md", `${route}\n`);
    expectError(documents, pattern);
  }
});

function delegatedSection(capsule: string): string {
  const words = Array.from({ length: 105 }, (_, index) => `fact${index}`).join(" ");
  return `

## Delegated scope

[Capsule](${capsule})

**Implemented.** ${words}

**Absent.** Explicit absence.
`;
}

test("requires reciprocal substantive delegation and rejects owner downgrade", () => {
  const documents = validDocuments();
  documents.set(
    `docs/${alphaFile}`,
    detailMap("Alpha", delegatedSection("capsules/ALPHA-SPEC.md")),
  );
  documents.set(
    "docs/capsules/ALPHA-SPEC.md",
    "# Alpha\n\n[`implementation-status-owner:ALPHA`](../ALPHA-IMPLEMENTATION-MAP.md#delegated-scope)\n",
  );
  expectError(documents, /downgraded.*owner/u);

  documents.set(
    "docs/capsules/ALPHA-SPEC.md",
    "# Alpha\n\n[`implementation-status-delegation:ALPHA`](../ALPHA-IMPLEMENTATION-MAP.md#delegated-scope)\n",
  );
  assert.deepEqual(errors(documents), []);

  documents.set(`docs/${alphaFile}`, detailMap("Alpha", "\n\n## Delegated scope\n\n[Capsule](capsules/ALPHA-SPEC.md)\n\n**Implemented.** Too short.\n\n**Absent.** None.\n"));
  expectError(documents, /at least 100 words/u);
});

test("ignored Markdown cannot launder delegation markers or substance", () => {
  const hidden = Array.from({ length: 105 }, (_, index) => `hidden${index}`).join(" ");
  const conceal: ReadonlyArray<(value: string) => string> = [
    (value) => `<!-- ${value} -->`,
    (value) => `\`\`\`md\n${value}\n\`\`\``,
    (value) => `\`${value}\``,
    (value) => `    ${value}`,
  ];
  for (const wrap of conceal) {
    for (const concealed of [
      wrap(`**Implemented.** ${hidden} **Absent.**`),
      `**Implemented.** Visible.\n\n${wrap(hidden)}\n\n**Absent.** Visible.`,
    ]) {
      const documents = validDocuments();
      documents.set(
        `docs/${alphaFile}`,
        detailMap("Alpha", `\n\n## Delegated scope\n\n[Capsule](capsules/ALPHA-SPEC.md)\n\n${concealed}\n`),
      );
      documents.set(
        "docs/capsules/ALPHA-SPEC.md",
        "# Alpha\n\n[`implementation-status-delegation:ALPHA`](../ALPHA-IMPLEMENTATION-MAP.md#delegated-scope)\n",
      );
      expectError(documents, /delegation lacks|at least 100 words/u);
    }
  }
});

test("ignored Markdown cannot supply the reciprocal delegation backlink", () => {
  const documents = validDocuments();
  const words = Array.from({ length: 105 }, (_, index) => `fact${index}`).join(" ");
  documents.set(
    `docs/${alphaFile}`,
    detailMap(
      "Alpha",
      `\n\n## Delegated scope\n\n<!-- [Capsule](capsules/ALPHA-SPEC.md) -->\n\n**Implemented.** ${words}\n\n**Absent.** Explicit absence.\n`,
    ),
  );
  documents.set(
    "docs/capsules/ALPHA-SPEC.md",
    "# Alpha\n\n[`implementation-status-delegation:ALPHA`](../ALPHA-IMPLEMENTATION-MAP.md#delegated-scope)\n",
  );

  expectError(documents, /delegation lacks.*backlink/u);
});

test("allows owner navigation beside the unique matching delegation", () => {
  const documents = validDocuments();
  documents.set(
    `docs/${alphaFile}`,
    detailMap("Alpha", delegatedSection("capsules/ALPHA-SPEC.md")),
  );
  documents.set(
    "docs/capsules/ALPHA-SPEC.md",
    [
      "# Alpha",
      "",
      "[`implementation-status-delegation:ALPHA`](../ALPHA-IMPLEMENTATION-MAP.md#delegated-scope)",
      "",
      "Supporting navigation uses [`implementation-status-owner:ALPHA`](../ALPHA-IMPLEMENTATION-MAP.md#delegated-scope).",
      "",
    ].join("\n"),
  );
  assert.deepEqual(errors(documents), []);
});

test("treats fenced examples as examples, never declarations", () => {
  const documents = validDocuments();
  documents.set(
    "docs/NOTE.md",
    `# Example

\`\`\`md
IMPLEMENTATION-MAP.md
[\`implementation-status-delegation:ALPHA\`](ALPHA-IMPLEMENTATION-MAP.md#missing)
\`\`\`
`,
  );
  assert.deepEqual(errors(documents), []);
});

test("normalizes escapes before rejecting inline and reference-style map destinations", () => {
  const inline = validDocuments();
  inline.set("docs/NOTE.md", String.raw`Stale [status](IMPLEMENTATION-MAP\.md).`);
  expectError(inline, /NOTE\.md.*route atom/u);

  const reference = validDocuments();
  reference.set(
    "docs/NOTE.md",
    String.raw`Stale [status][map].

[map]: IMPLEMENTATION-MAP\.md`,
  );
  expectError(reference, /NOTE\.md.*bare implementation-map path/u);
});

test("special controls consume only their exact cell or step", () => {
  const planOutside = validDocuments();
  planOutside.set("docs/PLAN.md", plan(undefined, `See [alpha](${alphaFile}).`));
  expectError(planOutside, /outside.*Maps/u);

  const registryOutside = validDocuments();
  registryOutside.set("docs/README.md", `${registry()}\nOutside [alpha](${alphaFile}).\n`);
  expectError(registryOutside, /README\.md.*outside.*Registry/u);

  const registryWrongCell = validDocuments();
  registryWrongCell.set("docs/README.md", registry(`| Other | [Alpha duplicate](${alphaFile}) |\n`));
  expectError(registryWrongCell, /README\.md.*first cell/u);

  const startupExtra = validDocuments();
  startupExtra.set("CLAUDE.md", claude(`2. Read root [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md) and [alpha](docs/${alphaFile}) completely.`));
  expectError(startupExtra, /CLAUDE\.md.*additional map/u);

  const startupFragment = validDocuments();
  startupFragment.set("CLAUDE.md", claude("2. Read root [IMPLEMENTATION-MAP.md](docs/IMPLEMENTATION-MAP.md#routing) completely."));
  expectError(startupFragment, /CLAUDE\.md.*wrong exact shape or target/u);

  const planRole = validDocuments();
  planRole.set("docs/PLAN.md", plan("[`implementation-status-owner:ALPHA`](" + alphaFile + "), [beta](" + betaFile + ")"));
  expectError(planRole, /PLAN\.md.*Maps/u);
});
