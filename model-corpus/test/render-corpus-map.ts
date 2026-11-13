/**
 * Regenerates the corpus guard's generated files, `model-corpus/EXECUTABLE-MODEL-CORPUS-MAP.md` and
 * `model-corpus/retained-model-capabilities.json`, through the guard's own inspection (`corpus-inspection.ts`), so each
 * file it writes is exactly what "keeps the generated corpus map and retained-model capability list exact" compares.
 * The hosted evidence-branch workflow runs it after writing retained CIB evidence, which the map records per model.
 *
 * Run it after `./scripts/pnpm.sh run build:differential`, with the external research checkouts the corpus reads
 * provisioned (`./scripts/doctor.sh research`), as `./scripts/pnpm.sh run render:corpus-map`.
 *
 * Rule 2 declaration: scope is exactly those two files, never any other file; the effect is at most those two files
 * rewritten, none when the inspection fails, and a file left untouched when it is already current.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderCorpusFiles } from "./corpus-inspection.ts";

const invokedPath = process.argv[1] && path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  for (const [file, rendered] of await renderCorpusFiles()) {
    const name = path.basename(file);
    if (rendered === (await readFile(file, "utf8").catch(() => null))) {
      process.stdout.write(`${name} is current\n`);
    } else {
      await writeFile(file, rendered, "utf8");
      process.stdout.write(`rewrote ${name}\n`);
    }
  }
}
