#!/bin/sh

# Idempotently provisions the repository-owned external-source scope. Existing
# checkouts are never reset, cleaned, or rewritten: the final fail-closed check
# reports any wrong revision or local modification for explicit owner handling.

set -eu

scope=${1:-verify}
case "$scope" in
  verify|adoption|research|all) ;;
  *) echo "usage: $0 [verify|adoption|research|all]" >&2; exit 2 ;;
esac

script_dir=${0%/*}
project_root=$(CDPATH= cd "$script_dir/.." && pwd)
external_root=${BPMN_EXTERNAL_ROOT:-"$project_root/../oss"}
lock_path="$script_dir/external-sources.lock"
temporary_checkout=""

is_git_checkout_root() {
  candidate=$1
  test -d "$candidate" || return 1
  candidate_root=$(git -C "$candidate" rev-parse --show-toplevel 2>/dev/null) || return 1
  physical_candidate=$(CDPATH= cd "$candidate" && pwd -P)
  physical_candidate_root=$(CDPATH= cd "$candidate_root" && pwd -P)
  test "$physical_candidate" = "$physical_candidate_root"
}

scope_selects() {
  requested_scope=$1
  declared_scope=$2
  test "$requested_scope" = "all" || test "$requested_scope" = "$declared_scope"
}

cleanup() {
  if test -n "$temporary_checkout" && test -d "$temporary_checkout"; then
    case "$temporary_checkout" in
      "$external_root"/*.bootstrap.*) rm -rf "$temporary_checkout" ;;
      *) echo "refusing to clean unexpected checkout path: $temporary_checkout" >&2 ;;
    esac
  fi
}
trap cleanup 0 1 2 3 15

mkdir -p "$external_root"
corpus_root="$external_root/omg-bpmn-2.0.2"
if test -d "$corpus_root"; then
  BPMN_CORPUS_ROOT="$corpus_root" "$script_dir/verify-bpmn-corpus.sh"
else
  BPMN_CORPUS_ROOT="$corpus_root" "$script_dir/fetch-bpmn-corpus.sh"
fi

while IFS="	" read -r source_scope relative_path remote reference revision material_kind; do
  case "$source_scope" in
    \#*|"") continue ;;
    verify|adoption|research) ;;
    *) echo "external source lock has invalid scope $source_scope for $relative_path" >&2; exit 1 ;;
  esac
  if ! scope_selects "$scope" "$source_scope"; then
    continue
  fi
  if test "$material_kind" != "repository"; then
    continue
  fi

  checkout="$external_root/$relative_path"
  if is_git_checkout_root "$checkout"; then
    continue
  fi
  if test -e "$checkout"; then
    echo "external source target exists but is not a Git checkout root: $checkout; preserve or remove it explicitly" >&2
    exit 1
  fi
  mkdir -p "${checkout%/*}"
  temporary_checkout="$checkout.bootstrap.$$"
  echo "Cloning $remote at $revision into $relative_path"
  git clone --filter=blob:none --no-checkout "$remote" "$temporary_checkout"
  git -C "$temporary_checkout" checkout --detach "$revision"
  mv "$temporary_checkout" "$checkout"
  temporary_checkout=""
done < "$lock_path"

while IFS="	" read -r source_scope relative_path remote reference revision material_kind; do
  case "$source_scope" in
    \#*|"") continue ;;
    verify|adoption|research) ;;
    *) echo "external source lock has invalid scope $source_scope for $relative_path" >&2; exit 1 ;;
  esac
  if ! scope_selects "$scope" "$source_scope"; then
    continue
  fi
  case "$material_kind" in
    submodule:*) ;;
    *) continue ;;
  esac

  parent_relative_path=${material_kind#submodule:}
  parent_checkout="$external_root/$parent_relative_path"
  submodule_path=${relative_path#"$parent_relative_path"/}
  checkout="$external_root/$relative_path"
  if is_git_checkout_root "$checkout"; then
    continue
  fi
  if test -e "$checkout"; then
    echo "external source target exists but is not a Git checkout root: $checkout; preserve or remove it explicitly" >&2
    exit 1
  fi
  if ! is_git_checkout_root "$parent_checkout"; then
    echo "external submodule parent is absent at $parent_checkout" >&2
    exit 1
  fi
  echo "Initializing $relative_path at superproject-pinned revision $revision"
  git -C "$parent_checkout" submodule update --init -- "$submodule_path"
done < "$lock_path"

trap - 0 1 2 3 15
BPMN_EXTERNAL_ROOT="$external_root" "$script_dir/check-external-sources.sh" "$scope"
