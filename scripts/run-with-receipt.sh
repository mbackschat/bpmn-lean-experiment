#!/usr/bin/env bash

set -uo pipefail

usage() {
  printf 'usage: %s <receipt-directory> -- <command> [argument ...]\n' "$0" >&2
  exit 2
}

receipt_root=${1:-}
if [ -z "$receipt_root" ] || [ "$receipt_root" = "/" ]; then
  usage
fi
shift
if [ "${1:-}" != "--" ]; then
  usage
fi
shift
if [ "$#" -eq 0 ]; then
  usage
fi

mkdir -p -- "$receipt_root" || exit 2
log_path="$receipt_root/output.log"
status_path="$receipt_root/exit-status"
command_path="$receipt_root/command.txt"
head_path="$receipt_root/git-head"

# Refusing reuse keeps an earlier result recoverable instead of silently replacing its evidence.
for evidence_path in "$log_path" "$status_path" "$command_path" "$head_path"; do
  if [ -e "$evidence_path" ]; then
    printf 'receipt directory already contains command evidence: %s\n' "$receipt_root" >&2
    exit 2
  fi
done

if ! git_head=$(git rev-parse --verify 'HEAD^{commit}' 2>/dev/null); then
  printf 'command receipt requires a Git worktree with a committed HEAD: %s\n' "$PWD" >&2
  exit 2
fi
if [[ ! "$git_head" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'command receipt resolved an invalid Git HEAD: %s\n' "$git_head" >&2
  exit 2
fi
printf '%s\n' "$git_head" > "$head_path.tmp" || exit 2
mv "$head_path.tmp" "$head_path" || exit 2

{
  printf 'cwd=%q\n' "$PWD"
  printf 'command='
  printf '%q ' "$@"
  printf '\n'
} > "$command_path.tmp" || exit 2
mv "$command_path.tmp" "$command_path" || exit 2
printf 'COMMAND_RECEIPT_DIR=%s\n' "$receipt_root"

"$@" 2>&1 | tee "$log_path"
# Every following simple command replaces PIPESTATUS, so snapshot both pipeline results immediately.
pipeline_status=("${PIPESTATUS[@]}")
command_exit=${pipeline_status[0]}
capture_exit=${pipeline_status[1]}
if [ "$capture_exit" -ne 0 ]; then
  printf 'durable log capture failed with exit %s\n' "$capture_exit" >&2
  command_exit=125
fi

# Receipt absence deliberately means that no authoritative completion was published.
printf '%s\n' "$command_exit" > "$status_path.tmp" || exit 125
mv "$status_path.tmp" "$status_path" || exit 125
printf 'COMMAND_RECEIPT_COMPLETE=%s exitStatus=%s\n' "$receipt_root" "$command_exit"
exit "$command_exit"
