#!/bin/sh

# Fails unless every external input selected by the requested contributor scope
# is present at its exact repository-owned pin. No verification lane may turn a
# missing checkout into a skip or a weaker claim.

set -eu

scope=${1:-verify}
case "$scope" in
  verify|all) ;;
  *) echo "usage: $0 [verify|all]" >&2; exit 2 ;;
esac

script_dir=${0%/*}
project_root=$(CDPATH= cd "$script_dir/.." && pwd)
external_root=${BPMN_EXTERNAL_ROOT:-"$project_root/../oss"}
lock_path="$script_dir/external-sources.lock"

is_git_checkout_root() {
  candidate=$1
  test -d "$candidate" || return 1
  candidate_root=$(git -C "$candidate" rev-parse --show-toplevel 2>/dev/null) || return 1
  physical_candidate=$(CDPATH= cd "$candidate" && pwd -P)
  physical_candidate_root=$(CDPATH= cd "$candidate_root" && pwd -P)
  test "$physical_candidate" = "$physical_candidate_root"
}

BPMN_CORPUS_ROOT="$external_root/omg-bpmn-2.0.2" "$script_dir/verify-bpmn-corpus.sh"

checked=0
repositories=0
submodules=0
while IFS="	" read -r source_scope relative_path remote reference revision material_kind; do
  case "$source_scope" in
    \#*|"") continue ;;
  esac
  if test "$scope" = "verify" && test "$source_scope" != "verify"; then
    continue
  fi

  checkout="$external_root/$relative_path"
  if ! is_git_checkout_root "$checkout"; then
    echo "external source is absent at $checkout; run ./scripts/setup-external-sources.sh $scope" >&2
    exit 1
  fi
  case "$material_kind" in
    repository)
      repositories=$((repositories + 1))
      ;;
    submodule:*)
      parent_relative_path=${material_kind#submodule:}
      parent_checkout="$external_root/$parent_relative_path"
      submodule_path=${relative_path#"$parent_relative_path"/}
      if test "$submodule_path" = "$relative_path"; then
        echo "external source lock has invalid parent $parent_relative_path for $relative_path" >&2
        exit 1
      fi
      superproject_revision=$(git -C "$parent_checkout" rev-parse "HEAD:$submodule_path")
      if test "$superproject_revision" != "$revision"; then
        echo "external submodule $relative_path is pinned by its superproject to $superproject_revision, expected $revision" >&2
        exit 1
      fi
      submodules=$((submodules + 1))
      ;;
    *)
      echo "external source lock has invalid material kind $material_kind for $relative_path" >&2
      exit 1
      ;;
  esac
  actual_remote=$(git -C "$checkout" remote get-url origin)
  canonical_actual_remote=${actual_remote%.git}
  canonical_expected_remote=${remote%.git}
  if test "$canonical_actual_remote" != "$canonical_expected_remote"; then
    echo "external source $relative_path uses remote $actual_remote, expected canonical remote $remote" >&2
    exit 1
  fi
  actual_revision=$(git -C "$checkout" rev-parse HEAD)
  if test "$actual_revision" != "$revision"; then
    echo "external source $relative_path is at $actual_revision, expected $revision; preserve local work and repair or replace the checkout explicitly" >&2
    exit 1
  fi
  case "$reference" in
    commit) ;;
    tag:*)
      tag_revision=$(git -C "$checkout" rev-parse "refs/tags/${reference#tag:}^{commit}")
      if test "$tag_revision" != "$revision"; then
        echo "external source $relative_path tag ${reference#tag:} resolves to $tag_revision, expected $revision" >&2
        exit 1
      fi
      ;;
    *) echo "external source lock has invalid immutable reference $reference for $relative_path" >&2; exit 1 ;;
  esac
  if test -n "$(git -C "$checkout" status --porcelain --untracked-files=normal)"; then
    echo "external source $relative_path has local source changes; the pinned evidence checkout must remain pristine" >&2
    exit 1
  fi
  checked=$((checked + 1))
  echo "EXTERNAL_SOURCE_OK kind=$material_kind path=$relative_path reference=$reference revision=$revision remote=$remote"
done < "$lock_path"

echo "EXTERNAL_SOURCE_CHECK scope=$scope gitMaterials=$checked repositories=$repositories submodules=$submodules corpus=verified root=$external_root"
