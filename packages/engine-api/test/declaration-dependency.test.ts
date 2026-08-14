import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

test("emitted declarations reference only direct workspace dependencies", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  ) as Readonly<{
    name: string;
    dependencies?: Readonly<Record<string, string>>;
    optionalDependencies?: Readonly<Record<string, string>>;
    peerDependencies?: Readonly<Record<string, string>>;
  }>;
  const directDependencies = new Set([
    manifest.name,
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
  const declarationPaths = (await readdir(path.join(packageRoot, "dist"), {
    recursive: true,
  })).filter((entry) => entry.endsWith(".d.ts"));
  const declarations = await Promise.all(declarationPaths.map(async (entry) => ({
    path: entry,
    source: await readFile(path.join(packageRoot, "dist", entry), "utf8"),
  })));

  assert.deepEqual(
    undeclaredWorkspaceReferences(declarations, directDependencies),
    [],
  );
});

test("declaration dependency check rejects inferred and subpath leaks", () => {
  assert.deepEqual(
    undeclaredWorkspaceReferences([{
      path: "leaked.d.ts",
      source: [
        "export declare const leaked: typeof import(\"@bpmn-lean/private-protocol\").Value;",
        "export type AlsoLeaked = import('@bpmn-lean/other-private/subpath').Value;",
        "export type Sound = import('@bpmn-lean/declared/subpath').Value;",
        "/** The string \"@bpmn-lean/comment-only\" is documentation, not a dependency. */",
      ].join("\n"),
    }], new Set(["@bpmn-lean/declared"])),
    [
      "leaked.d.ts: undeclared workspace dependency @bpmn-lean/other-private",
      "leaked.d.ts: undeclared workspace dependency @bpmn-lean/private-protocol",
    ],
  );
});

function undeclaredWorkspaceReferences(
  declarations: ReadonlyArray<Readonly<{ path: string; source: string }>>,
  directDependencies: ReadonlySet<string>,
): string[] {
  const findings = new Set<string>();
  for (const declaration of declarations) {
    const moduleReferences = [
      /\bfrom\s*["'](@bpmn-lean\/[a-z0-9-]+)(?:\/[^"']*)?["']/gu,
      /\bimport\s*\(\s*["'](@bpmn-lean\/[a-z0-9-]+)(?:\/[^"']*)?["']\s*\)/gu,
      /\bimport\s*["'](@bpmn-lean\/[a-z0-9-]+)(?:\/[^"']*)?["']/gu,
    ];
    for (const pattern of moduleReferences) {
      for (const match of declaration.source.matchAll(pattern)) {
        const packageName = match[1];
        if (packageName !== undefined && !directDependencies.has(packageName)) {
          findings.add(
            `${declaration.path}: undeclared workspace dependency ${packageName}`,
          );
        }
      }
    }
  }
  return [...findings].sort();
}
