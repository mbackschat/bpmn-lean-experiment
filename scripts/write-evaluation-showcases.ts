import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProcessShowcaseCatalog } from "./rc-showcase-catalog.ts";

/** Copies exactly the retained human journeys into a Docker-only evaluation bundle. */
export async function writeEvaluationShowcases(projectRoot: string, bundleRoot: string): Promise<void> {
  const catalog = await buildProcessShowcaseCatalog(projectRoot);
  const human = catalog.filter((entry) => entry.showcase?.mode === "human");
  if (human.length === 0) throw new Error("Evaluation bundle has no interactive human processes");
  const records: string[] = [];
  for (const model of human) {
    if (!/^scenarios\/[a-z0-9-]+\/process\.bpmn$/u.test(model.sourcePath)
      || !/^[a-z0-9-]+$/u.test(model.id)
      || !/^[a-z0-9.-]+$/u.test(model.profile)) {
      throw new Error(`Evaluation bundle has an invalid human model binding: ${model.id}`);
    }
    const target = path.join(bundleRoot, model.sourcePath);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(projectRoot, model.sourcePath), target);
    records.push([model.id, model.sourcePath, model.profile, model.sha256].join("|"));
  }
  const manifest = path.join(bundleRoot, "deploy/evaluation/prepared-human-showcases.txt");
  await mkdir(path.dirname(manifest), { recursive: true });
  await writeFile(manifest, `${records.join("\n")}\n`, "utf8");
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  const bundleRoot = process.argv[2];
  if (bundleRoot === undefined || process.argv.length !== 3) {
    throw new Error("Usage: node scripts/write-evaluation-showcases.ts <bundle-root>");
  }
  await writeEvaluationShowcases(path.resolve(fileURLToPath(new URL("..", import.meta.url))), path.resolve(bundleRoot));
}
