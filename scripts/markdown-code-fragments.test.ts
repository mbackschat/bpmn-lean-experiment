import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  checkMarkdownCodeFragments,
  syncMarkdownCodeFragments,
} from "./markdown-code-fragments.ts";

test("checks and synchronizes Markdown fences from tagged source regions", async () => {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "bpmn-markdown-fragments-"),
  );
  const sourcePath = path.join(projectRoot, "src", "example.ts");
  const documentPath = path.join(projectRoot, "docs", "guide.md");

  try {
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await mkdir(path.dirname(documentPath), { recursive: true });
    await writeFile(
      sourcePath,
      [
        "export function example() {",
        "  // tag::example[]",
        '  return "current";',
        "  // end::example[]",
        "}",
        "",
      ].join("\n"),
    );
    await writeFile(
      documentPath,
      [
        "# Guide",
        "",
        "<!-- source-fragment: src/example.ts#example -->",
        "```ts",
        'return "stale";',
        "```",
        "",
      ].join("\n"),
    );

    await assert.rejects(
      checkMarkdownCodeFragments({
        projectRoot,
        markdownFiles: [documentPath],
      }),
      /src\/example\.ts#example has drifted/u,
    );

    const result = await syncMarkdownCodeFragments({
      projectRoot,
      markdownFiles: [documentPath],
    });
    assert.deepEqual(result, {
      fragmentCount: 1,
      changedFiles: ["docs/guide.md"],
    });
    assert.match(
      await readFile(documentPath, "utf8"),
      /```ts\nreturn "current";\n```/u,
    );
    await checkMarkdownCodeFragments({
      projectRoot,
      markdownFiles: [documentPath],
    });
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("rejects source paths outside the project root", async () => {
  const projectRoot = await mkdtemp(
    path.join(tmpdir(), "bpmn-markdown-fragments-"),
  );
  const documentPath = path.join(projectRoot, "docs", "guide.md");

  try {
    await mkdir(path.dirname(documentPath), { recursive: true });
    await writeFile(
      documentPath,
      [
        "<!-- source-fragment: ../outside.ts#example -->",
        "```ts",
        "stale",
        "```",
        "",
      ].join("\n"),
    );

    await assert.rejects(
      checkMarkdownCodeFragments({
        projectRoot,
        markdownFiles: [documentPath],
      }),
      /must stay inside the project root/u,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
