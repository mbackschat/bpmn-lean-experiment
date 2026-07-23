#!/bin/sh

set -eu

project_root=$(git rev-parse --show-toplevel)
runner_dir="$project_root/runners/cibseven"
java_home=${BPMN_JAVA_HOME:-/opt/homebrew/opt/openjdk@21}
maven_settings=${BPMN_MAVEN_SETTINGS:-"$runner_dir/maven-settings.xml"}

test -x "$java_home/bin/java"
test -f "$maven_settings"

set -- \
  -s "$maven_settings" \
  -f "$runner_dir/pom.xml" \
  --no-transfer-progress \
  -Dstyle.color=never \
  test

if test -n "${BPMN_MAVEN_REPO_LOCAL:-}"; then
  set -- "-Dmaven.repo.local=$BPMN_MAVEN_REPO_LOCAL" "$@"
fi

JAVA_HOME="$java_home" "$runner_dir/mvnw" "$@"
