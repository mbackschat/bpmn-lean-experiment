/** Publishes the only machine-readable verdict for one completed long-command receipt. */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type CommandReceipt = Readonly<{
  exitStatus: number;
  gitHead: string;
  receipt: string;
}>;

export class InvalidCommandReceiptError extends Error {
  readonly receipt: string;
  readonly reason: string;

  constructor(
    receipt: string,
    reason: string,
  ) {
    super(`invalid command receipt ${receipt}: ${reason}`);
    this.name = "InvalidCommandReceiptError";
    this.receipt = receipt;
    this.reason = reason;
  }
}

export function readCommandReceipt(receiptRoot: string): CommandReceipt {
  const receipt = path.resolve(receiptRoot);
  try {
    const commandFile = statSync(path.join(receipt, "command.txt"));
    const outputFile = statSync(path.join(receipt, "output.log"));
    const statusText = readFileSync(path.join(receipt, "exit-status"), "utf8");
    const gitHeadText = readFileSync(path.join(receipt, "git-head"), "utf8");
    if (!commandFile.isFile() || commandFile.size === 0) {
      throw new InvalidCommandReceiptError(receipt, "empty-command");
    }
    if (!outputFile.isFile()) {
      throw new InvalidCommandReceiptError(receipt, "invalid-output-log");
    }
    if (!/^(?:0|[1-9]\d{0,2})\n$/u.test(statusText)) {
      throw new InvalidCommandReceiptError(receipt, "malformed-exit-status");
    }
    if (!/^[0-9a-f]{40}\n$/u.test(gitHeadText)) {
      throw new InvalidCommandReceiptError(receipt, "malformed-git-head");
    }
    const exitStatus = Number.parseInt(statusText, 10);
    if (exitStatus > 255) {
      throw new InvalidCommandReceiptError(receipt, "out-of-range-exit-status");
    }
    return {
      exitStatus,
      gitHead: gitHeadText.trim(),
      receipt,
    };
  } catch (error) {
    if (error instanceof InvalidCommandReceiptError) {
      throw error;
    }
    throw new InvalidCommandReceiptError(receipt, "incomplete-evidence");
  }
}

function runCli(receiptRoot: string | undefined): void {
  if (receiptRoot === undefined || process.argv.length !== 3) {
    process.stderr.write(
      "COMMAND_RECEIPT_VERDICT=invalid receipt=not-provided reason=usage\n",
    );
    process.exitCode = 2;
    return;
  }
  try {
    const receipt = readCommandReceipt(receiptRoot);
    if (receipt.exitStatus === 0) {
      process.stdout.write(
        `COMMAND_RECEIPT_VERDICT=success exitStatus=0 gitHead=${receipt.gitHead} receipt=${receipt.receipt}\n`,
      );
    } else {
      process.stderr.write(
        `COMMAND_RECEIPT_VERDICT=failure exitStatus=${receipt.exitStatus} gitHead=${receipt.gitHead} receipt=${receipt.receipt}\n`,
      );
      process.exitCode = 1;
    }
  } catch (error) {
    if (error instanceof InvalidCommandReceiptError) {
      process.stderr.write(
        `COMMAND_RECEIPT_VERDICT=invalid receipt=${error.receipt} reason=${error.reason}\n`,
      );
      process.exitCode = 2;
      return;
    }
    throw error;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  runCli(process.argv[2]);
}
