-- 終了済みゲームの24時間経過データを自動削除する関数
CREATE OR REPLACE FUNCTION cleanup_old_games()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_sessions integer;
  deleted_teams integer;
  deleted_turn_events integer;
  cutoff_date timestamptz;
  session_ids uuid[];
BEGIN
  cutoff_date := now() - interval '24 hours';

  SELECT array_agg(id) INTO session_ids
  FROM game_sessions
  WHERE status = 'finished'
    AND finished_at IS NOT NULL
    AND finished_at < cutoff_date;

  IF session_ids IS NULL OR array_length(session_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'deleted_sessions', 0,
      'deleted_teams', 0,
      'deleted_turn_events', 0
    );
  END IF;

  DELETE FROM turn_events WHERE game_session_id = ANY(session_ids);
  GET DIAGNOSTICS deleted_turn_events = ROW_COUNT;

  DELETE FROM teams WHERE game_session_id = ANY(session_ids);
  GET DIAGNOSTICS deleted_teams = ROW_COUNT;

  DELETE FROM game_sessions WHERE id = ANY(session_ids);
  GET DIAGNOSTICS deleted_sessions = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_sessions', deleted_sessions,
    'deleted_teams', deleted_teams,
    'deleted_turn_events', deleted_turn_events
  );
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_old_games() TO anon;
GRANT EXECUTE ON FUNCTION cleanup_old_games() TO authenticated;

-- 毎時自動実行（pg_cronはSupabase側で直接適用済み）
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('cleanup-old-games', '0 * * * *', $$SELECT cleanup_old_games()$$);

-- マスターデータ（ゲームセット）削除関数
CREATE OR REPLACE FUNCTION delete_game_set(target_game_set_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count integer;
  deleted_cells integer;
  deleted_quizzes integer;
  deleted_actions integer;
  gs_name text;
BEGIN
  SELECT name INTO gs_name FROM game_sets WHERE id = target_game_set_id;
  IF gs_name IS NULL THEN
    RETURN jsonb_build_object('error', 'ゲームセットが見つかりません');
  END IF;

  SELECT count(*) INTO active_count
  FROM game_sessions
  WHERE game_set_id = target_game_set_id
    AND status IN ('waiting', 'playing');

  IF active_count > 0 THEN
    RETURN jsonb_build_object('error', 'プレイ中または受付中のゲームがあるため削除できません（' || active_count || '件）');
  END IF;

  DELETE FROM turn_events
  WHERE game_session_id IN (SELECT id FROM game_sessions WHERE game_set_id = target_game_set_id);
  DELETE FROM teams
  WHERE game_session_id IN (SELECT id FROM game_sessions WHERE game_set_id = target_game_set_id);
  DELETE FROM game_sessions WHERE game_set_id = target_game_set_id;

  DELETE FROM cells WHERE game_set_id = target_game_set_id;
  GET DIAGNOSTICS deleted_cells = ROW_COUNT;
  DELETE FROM quizzes WHERE game_set_id = target_game_set_id;
  GET DIAGNOSTICS deleted_quizzes = ROW_COUNT;
  DELETE FROM actions WHERE game_set_id = target_game_set_id;
  GET DIAGNOSTICS deleted_actions = ROW_COUNT;
  DELETE FROM game_sets WHERE id = target_game_set_id;

  RETURN jsonb_build_object(
    'success', true, 'name', gs_name,
    'deleted_cells', deleted_cells,
    'deleted_quizzes', deleted_quizzes,
    'deleted_actions', deleted_actions
  );
END;
$$;

GRANT EXECUTE ON FUNCTION delete_game_set(uuid) TO anon;
GRANT EXECUTE ON FUNCTION delete_game_set(uuid) TO authenticated;

-- DB容量情報取得関数
CREATE OR REPLACE FUNCTION get_db_size_info()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  db_size bigint;
BEGIN
  SELECT pg_database_size(current_database()) INTO db_size;
  RETURN jsonb_build_object(
    'used_bytes', db_size, 'limit_bytes', 536870912,
    'used_mb', round(db_size / 1048576.0, 1), 'limit_mb', 512
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_db_size_info() TO anon;
GRANT EXECUTE ON FUNCTION get_db_size_info() TO authenticated;
