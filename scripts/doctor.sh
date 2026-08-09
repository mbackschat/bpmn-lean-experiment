#!/bin/sh

# Read-only contributor preflight. It reports exact tool versions, workspace
# dependencies, and external pins, then fails if the selected scope is not ready
# for full-strength verification.

set -u

scope=${1:-verify}
case "$scope" in
  verify|adoption|research|all) ;;
  *) echo "usage: $0 [verify|adoption|research|all]" >&2; exit 2 ;;
esac

script_dir=${0%/*}
project_root=$(CDPATH= cd "$script_dir/.." && pwd)
eval "$("$script_dir/pinned-toolchain.sh")"
external_root=${BPMN_EXTERNAL_ROOT:-"$project_root/../oss"}
maven_user_home=${MAVEN_USER_HOME:-"$HOME/.m2"}
if test -n "${PLAYWRIGHT_BROWSERS_PATH:-}"; then
  playwright_browsers_path=$PLAYWRIGHT_BROWSERS_PATH
elif test "$(uname -s)" = "Darwin"; then
  playwright_browsers_path="$HOME/Library/Caches/ms-playwright"
else
  playwright_browsers_path="$HOME/.cache/ms-playwright"
fi
cache_lock="$script_dir/workspace-cache.lock"
doctor_failed=0

check_command() {
  command_name=$1
  installation=$2
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "DOCTOR_FAIL missing $command_name ($installation)" >&2
    doctor_failed=1
    return 1
  fi
  echo "DOCTOR_TOOL $command_name $(command -v "$command_name")"
}

check_command git "Homebrew: brew install git" || true
check_command curl "provided by macOS; Homebrew: brew install curl" || true
check_command jq "Homebrew: brew install jq" || true
check_command xmllint "Homebrew: brew install libxml2" || true
check_command node "install Node $required_node_version through nvm, asdf, or Homebrew" || true
check_command lake "install Lean through elan using lean-toolchain" || true

hash_command=""
if command -v shasum >/dev/null 2>&1; then
  hash_command="shasum"
  echo "DOCTOR_TOOL sha256 $(command -v shasum)"
elif command -v sha256sum >/dev/null 2>&1; then
  hash_command="sha256sum"
  echo "DOCTOR_TOOL sha256 $(command -v sha256sum)"
else
  echo "DOCTOR_FAIL missing shasum or sha256sum (Homebrew: brew install coreutils)" >&2
  doctor_failed=1
fi

hash_file() {
  file_path=$1
  if test "$hash_command" = "shasum"; then
    shasum -a 256 "$file_path" | awk '{print $1}'
  else
    sha256sum "$file_path" | awk '{print $1}'
  fi
}

for owner_path in \
  .nvmrc \
  .node-version \
  package.json \
  pnpm-workspace.yaml \
  pnpm-lock.yaml \
  packages/bpmn-source/package.json \
  packages/differential/package.json \
  packages/semantic-core/package.json \
  packages/temporal-adapter/package.json \
  lean-toolchain \
  lakefile.toml \
  lake-manifest.json \
  runners/cibseven/pom.xml \
  runners/cibseven/.mvn/wrapper/maven-wrapper.properties \
  runners/cibseven/.mvn/wrapper/maven-wrapper.jar \
  scripts/external-sources.lock \
  scripts/workspace-cache.lock \
  docs/reference/bpmn-2.0.2/LOCAL-CORPUS.sha256
do
  if ! test -f "$project_root/$owner_path"; then
    echo "DOCTOR_FAIL dependency owner is absent: $owner_path" >&2
    doctor_failed=1
  elif test -n "$hash_command"; then
    echo "DOCTOR_DEPENDENCY_OWNER $owner_path sha256=$(hash_file "$project_root/$owner_path")"
  fi
done

while IFS="	" read -r source_scope relative_path remote reference revision material_kind; do
  case "$source_scope" in
    \#*|"") continue ;;
  esac
  echo "DOCTOR_EXTERNAL_DECLARED scope=$source_scope kind=$material_kind path=$relative_path reference=$reference revision=$revision remote=$remote"
done < "$script_dir/external-sources.lock"

cache_size_kib() {
  material_path=$1
  if test -d "$material_path"; then
    physical_path=$(CDPATH= cd "$material_path" && pwd -P)
    du -sk "$physical_path" 2>/dev/null | awk '{print $1}'
  else
    du -sk "$material_path" 2>/dev/null | awk '{print $1}'
  fi
}

while IFS="	" read -r material_role declared_path material_owner; do
  case "$material_role" in
    \#*|"") continue ;;
  esac
  case "$declared_path" in
    \$MAVEN_USER_HOME/*) material_path="$maven_user_home/${declared_path#\$MAVEN_USER_HOME/}" ;;
    \$PLAYWRIGHT_BROWSERS_PATH) material_path="$playwright_browsers_path" ;;
    \$BPMN_EXTERNAL_ROOT/*) material_path="$external_root/${declared_path#\$BPMN_EXTERNAL_ROOT/}" ;;
    *) material_path="$project_root/$declared_path" ;;
  esac
  if test -e "$material_path"; then
    echo "DOCTOR_CACHE role=$material_role status=present sizeKiB=$(cache_size_kib "$material_path") path=$declared_path owner=$material_owner"
  else
    echo "DOCTOR_CACHE role=$material_role status=absent sizeKiB=0 path=$declared_path owner=$material_owner"
    if test "$material_role" = "dependency"; then
      echo "DOCTOR_FAIL required dependency material is absent: $declared_path" >&2
      doctor_failed=1
    fi
  fi
done < "$cache_lock"

report_cached_artifact() {
  artifact_label=$1
  artifact_path=$2
  expected_sha256=${3:-}
  if ! test -f "$artifact_path" || test -z "$hash_command"; then
    return
  fi
  actual_sha256=$(hash_file "$artifact_path")
  artifact_status="observed"
  if test -n "$expected_sha256"; then
    if test "$actual_sha256" = "$expected_sha256"; then
      artifact_status="verified"
    else
      artifact_status="mismatch"
      doctor_failed=1
      echo "DOCTOR_FAIL cached artifact $artifact_label has SHA-256 $actual_sha256, expected $expected_sha256" >&2
    fi
  fi
  echo "DOCTOR_CACHE_ARTIFACT status=$artifact_status label=$artifact_label sha256=$actual_sha256 path=$artifact_path"
}

report_cached_artifact \
  "Temporal CLI v1.8.1 platform binary" \
  "$project_root/.cache/temporal-cli/temporal-v1.8.1"
report_cached_artifact \
  "Temporal SDK 1.21.0 test-server platform binary" \
  "$project_root/.cache/temporal-test-server/temporal-test-server-sdk-typescript-1.21.0"
maven_distribution=$(find "$maven_user_home/wrapper/dists" -type f -name apache-maven-3.8.8-bin.zip -print -quit 2>/dev/null || true)
if test -n "$maven_distribution"; then
  report_cached_artifact \
    "Apache Maven 3.8.8 distribution" \
    "$maven_distribution" \
    "2e181515ce8ae14b7a904c40bb4794831f5fd1d9641107a13b916af15af4001a"
fi

node_version=$(node --version 2>/dev/null || true)
if test "$node_version" != "v$required_node_version"; then
  echo "DOCTOR_FAIL Node $required_node_version required, found $node_version" >&2
  doctor_failed=1
fi

pnpm_version=$("$script_dir/pnpm.sh" --version 2>/dev/null || true)
if test "$pnpm_version" != "$required_pnpm_version"; then
  echo "DOCTOR_FAIL pnpm $required_pnpm_version required, found $pnpm_version" >&2
  doctor_failed=1
fi

java_home=$(node "$script_dir/java-home.ts" 2>/dev/null || true)
java_major=""
if test -n "$java_home" && test -x "$java_home/bin/java"; then
  java_major=$("$java_home/bin/java" -version 2>&1 | sed -n '1s/.*version "\([0-9][0-9]*\).*/\1/p')
fi
if test "$java_major" != "21"; then
  echo "DOCTOR_FAIL Java 21 required, found major ${java_major:-unknown}" >&2
  doctor_failed=1
fi

if ! test -d "$project_root/node_modules/.pnpm"; then
  echo "DOCTOR_FAIL workspace dependencies are absent; run ./scripts/pnpm.sh install --frozen-lockfile" >&2
  doctor_failed=1
fi

test "$node_version" = "v$required_node_version" && echo "DOCTOR_OK Node $required_node_version"
test "$pnpm_version" = "$required_pnpm_version" && echo "DOCTOR_OK pnpm $required_pnpm_version"
test "$java_major" = "21" && echo "DOCTOR_OK Java 21 $java_home"
command -v git >/dev/null 2>&1 && echo "DOCTOR_OK $(git --version)"
command -v lake >/dev/null 2>&1 && echo "DOCTOR_OK $(lake --version | head -1)"
command -v xmllint >/dev/null 2>&1 && echo "DOCTOR_OK xmllint $(command -v xmllint)"

if test -n "$hash_command" && command -v git >/dev/null 2>&1; then
  if ! BPMN_EXTERNAL_ROOT="$external_root" "$script_dir/check-external-sources.sh" "$scope"; then
    doctor_failed=1
  fi
else
  echo "DOCTOR_FAIL external-source verification could not run without Git and SHA-256 tooling" >&2
  doctor_failed=1
fi

if test "$doctor_failed" -ne 0; then
  echo "DOCTOR_FAIL contributor environment scope=$scope" >&2
  exit 1
fi
echo "DOCTOR_OK contributor environment scope=$scope"
