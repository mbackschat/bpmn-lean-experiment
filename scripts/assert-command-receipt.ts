/** Publishes the only machine-readable verdict for one completed long-command receipt. */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const receiptRoot = process.argv[2];

function invalid(receipt: string, reason: string): void {
  process.stderr.write(
    `COMMAND_RECEIPT_VERDICT=invalid receipt=${receipt} reason=${reason}\n`,
  );
  process.exitCode = 2;
}

if (receiptRoot === undefined || process.argv.length !== 3) {
  invalid("not-provided", "usage");
} else {
  const receipt = path.resolve(receiptRoot);
  try {
    const [commandFile, outputFile, statusText] = await Promise.all([
      stat(path.join(receipt, "command.txt")),
      stat(path.join(receipt, "output.log")),
      readFile(path.join(receipt, "exit-status"), "utf8"),
    ]);
    if (!commandFile.isFile() || commandFile.size === 0) {
      invalid(receipt, "empty-command");
    } else if (!outputFile.isFile()) {
      invalid(receipt, "invalid-output-log");
    } else if (!/^(?:0|[1-9]\d{0,2})\n$/u.test(statusText)) {
      invalid(receipt, "malformed-exit-status");
    } else {
      const exitStatus = Number.parseInt(statusText, 10);
      if (exitStatus > 255) {
        invalid(receipt, "out-of-range-exit-status");
      } else if (exitStatus === 0) {
        process.stdout.write(
          `COMMAND_RECEIPT_VERDICT=success exitStatus=0 receipt=${receipt}\n`,
        );
      } else {
        process.stderr.write(
          `COMMAND_RECEIPT_VERDICT=failure exitStatus=${exitStatus} receipt=${receipt}\n`,
        );
        process.exitCode = 1;
      }
    }
  } catch {
    invalid(receipt, "incomplete-evidence");
  }
}
