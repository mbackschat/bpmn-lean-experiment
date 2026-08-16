#!/bin/sh

set -eu

if test "$#" -eq 0; then
  echo "usage: $0 command [argument ...]" >&2
  exit 2
fi

postgresql_bin_dir=${POSTGRESQL_BIN_DIR:-/opt/homebrew/opt/postgresql@18/bin}
if ! test -x "$postgresql_bin_dir/initdb"; then
  postgresql_initdb=$(command -v initdb || true)
  if test -z "$postgresql_initdb"; then
    echo "PostgreSQL 18 is required; install Homebrew postgresql@18 or set POSTGRESQL_BIN_DIR." >&2
    exit 1
  fi
  postgresql_bin_dir=$(dirname "$postgresql_initdb")
fi

postgresql_test_root=$(mktemp -d "${TMPDIR:-/tmp}/bpmn-postgresql-18.XXXXXX")
postgresql_test_data="$postgresql_test_root/data"
postgresql_test_log="$postgresql_test_root/postgresql.log"
postgresql_test_port=$((55000 + ($$ % 1000)))
postgresql_started=false

cleanup_postgresql_test_server() {
  if test "$postgresql_started" = true; then
    "$postgresql_bin_dir/pg_ctl" -D "$postgresql_test_data" -m immediate -w stop >/dev/null 2>&1 || true
  fi
  rm -rf -- "$postgresql_test_root"
}
trap cleanup_postgresql_test_server EXIT HUP INT TERM

"$postgresql_bin_dir/initdb" -D "$postgresql_test_data" --auth=trust --encoding=UTF8 --no-locale >/dev/null
"$postgresql_bin_dir/pg_ctl" -D "$postgresql_test_data" -l "$postgresql_test_log" -o "-h 127.0.0.1 -p $postgresql_test_port" -w start >/dev/null
postgresql_started=true

BPMN_TEST_POSTGRES_URL="postgresql://127.0.0.1:$postgresql_test_port/postgres" "$@"
