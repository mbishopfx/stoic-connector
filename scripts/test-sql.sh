#!/usr/bin/env bash
set -euo pipefail

test_dir=$(mktemp -d /tmp/relaytest.XXXXXX)
cleanup() {
  pg_ctl -D "$test_dir/db" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$test_dir"
}
trap cleanup EXIT
initdb -D "$test_dir/db" -A trust -U relaytest >/dev/null
pg_ctl -D "$test_dir/db" -o "-k $test_dir -p 55438" -l "$test_dir/postgres.log" start >/dev/null
psql -X -q -v ON_ERROR_STOP=1 -h "$test_dir" -p 55438 -U relaytest -d postgres \
  -f tests/sql/bootstrap.sql \
  -f supabase/migrations/202609270001_initial.sql \
  -f supabase/migrations/202609270002_task_rpcs.sql \
  -f supabase/migrations/202609270003_stripe_events.sql \
  -f supabase/migrations/202609270004_reservations_approvals.sql \
  -f supabase/migrations/202609270005_rate_limits.sql \
  -f supabase/migrations/202609270006_project_routing.sql \
  -f supabase/migrations/202609270007_usage.sql \
  -f tests/sql/integration.sql
