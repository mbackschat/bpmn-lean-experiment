import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const documentRoots = [
  "contracts",
  "docs",
  "packages",
  "profiles",
  "runners",
  "scenarios",
];

async function markdownFiles(relativeRoot) {
  const entries = await readdir(path.join(projectRoot, relativeRoot), {
    withFileTypes: true,
  });
  const nested = await Promise.all(
    entries.flatMap((entry) => {
      const relativePath = path.join(relativeRoot, entry.name);
      if (entry.isDirectory() && relativePath !== "docs/reference") {
        return [markdownFiles(relativePath)];
      }
      return entry.isFile() && entry.name.endsWith(".md")
        ? [[relativePath]]
        : [];
    }),
  );
  return nested.flat();
}

function localLinkTargets(markdown) {
  return [...markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu)]
    .map((match) => match[1].trim())
    .filter(
      (target) =>
        !target.startsWith("#") &&
        !/^[a-z][a-z0-9+.-]*:/iu.test(target),
    )
    .map((target) => {
      const withoutTitle = target.startsWith("<")
        ? target.slice(1, target.indexOf(">"))
        : target.split(/\s+/u)[0];
      return decodeURIComponent(withoutTitle.split("#", 1)[0]);
    })
    .filter(Boolean);
}

test("keeps project-authored local Markdown links resolvable", async () => {
  const files = [
    "README.md",
    "CLAUDE.md",
    ...(await Promise.all(documentRoots.map(markdownFiles))).flat(),
  ];
  const missing = [];

  for (const relativeDocumentPath of files) {
    const documentPath = path.join(projectRoot, relativeDocumentPath);
    const markdown = await readFile(documentPath, "utf8");
    for (const target of localLinkTargets(markdown)) {
      const resolved = path.resolve(path.dirname(documentPath), target);
      try {
        await access(resolved);
      } catch {
        missing.push(`${relativeDocumentPath} -> ${target}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});
