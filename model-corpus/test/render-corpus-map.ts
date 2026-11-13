/**
 * Regenerates `model-corpus/EXECUTABLE-MODEL-CORPUS-MAP.md` through the corpus guard's own inspection
 * (`corpus-inspection.ts`), so the file it writes is exactly what "keeps the generated corpus map exact" compares.
 * The hosted evidence-branch workflow runs it after writing retained CIB evidence, which the map records per model.
 *
 * Run it after `./scripts/pnpm.sh run build:differential`, with the external research checkouts the corpus reads
 * provisioned (`./scripts/doctor.sh research`), as `./scripts/pnpm.sh run render:corpus-map`.
 *
 * Rule 2 declaration: scope is exactly `model-corpus/EXECUTABLE-MODEL-CORPUS-MAP.md`, never any other file; the effect is
 * one rewritten file, left untouched when the inspection fails or the map is already current.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { corpusMapPath, renderCorpusMap } from "./corpus-inspection.ts";

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const map = await renderCorpusMap();
  if (map === (await readFile(corpusMapPath, "utf8"))) {
    process.stdout.write("the corpus map is current\n");
  } else {
    await writeFile(corpusMapPath, map, "utf8");
    process.stdout.write("rewrote the corpus map\n");
  }
}
