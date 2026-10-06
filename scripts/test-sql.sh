#!/usr/bin/env bash
set -euo pipefail

test_dir=$(mktemp -d "${TMPDIR:-/tmp}/relaytest.XXXXXX")
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
  -f supabase/migrations/202609270008_paid_uncapped_access.sql \
  -f supabase/migrations/202609270009_remove_request_throttles.sql \
  -f supabase/migrations/202609270010_project_board.sql \
  -f supabase/migrations/202609270011_synthesis_runs.sql \
  -f supabase/migrations/202609270012_board_retry_race.sql \
  -f supabase/migrations/202609270013_board_read_cursors.sql \
  -f supabase/migrations/202609270014_board_cursor_index.sql \
  -f supabase/migrations/202609270015_synthesis_queue.sql \
  -f supabase/migrations/202609270016_agent_access_notes.sql \
  -f supabase/migrations/202609270017_distinct_handoff_worker.sql \
  -f supabase/migrations/202609270018_guard_boss_role_change.sql \
  -f supabase/migrations/202609270019_artifact_idempotency.sql \
  -f supabase/migrations/202609270020_handoff_retry_conflicts.sql \
  -f supabase/migrations/202609270021_artifact_board_notice.sql \
  -f supabase/migrations/202609270022_artifact_deletion_history.sql \
  -f supabase/migrations/202609270023_signup_provisioning_and_agent_projects.sql \
  -f supabase/migrations/202609270024_knowledge_base.sql \
  -f supabase/migrations/202609270025_owner_intake.sql \
  -f supabase/migrations/202609270026_team_queue_handoffs.sql \
  -f supabase/migrations/20260928220551_attach_intake_artifacts_to_handoff.sql \
  -f supabase/migrations/20260929005456_knowledge_steward_runner.sql \
  -f supabase/migrations/20260929020000_handoff_history_search.sql \
  -f supabase/migrations/20260929233533_stoic_oauth_audience_hook.sql \
  -f supabase/migrations/20260930040242_agent_harness_names.sql \
  -f supabase/migrations/20261001155032_stoic_ideas_contacts.sql \
  -f supabase/migrations/20261003133000_contact_link.sql \
  -f supabase/migrations/20261005135247_agent_dialogue_limits.sql \
  -f supabase/migrations/202610060001_ideas_worker_assignment.sql \
  -f supabase/migrations/202610060002_activity_analytics.sql \
  -f supabase/migrations/202610060003_agent_diaries_and_collaboration_metrics.sql \
  -f supabase/migrations/20261006135828_rolling_project_group_chat.sql \
  -f tests/sql/integration.sql
