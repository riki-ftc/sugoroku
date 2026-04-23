-- 終了済みゲームの古いデータを削除する関数
-- days_old: 指定日数より前に終了したゲームを対象にする
CREATE OR REPLACE FUNCTION cleanup_old_games(days_old integer DEFAULT 30)
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
  cutoff_date := now() - (days_old || ' days')::interval;

  SELECT array_agg(id) INTO session_ids
  FROM game_sessions
  WHERE status = 'finished'
    AND finished_at IS NOT NULL
    AND finished_at < cutoff_date;

  IF session_ids IS NULL OR array_length(session_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'deleted_sessions', 0,
      'deleted_teams', 0,
      'deleted_turn_events', 0,
      'cutoff_date', cutoff_date
    );
  END IF;

  DELETE FROM turn_events
  WHERE game_session_id = ANY(session_ids);
  GET DIAGNOSTICS deleted_turn_events = ROW_COUNT;

  DELETE FROM teams
  WHERE game_session_id = ANY(session_ids);
  GET DIAGNOSTICS deleted_teams = ROW_COUNT;

  DELETE FROM game_sessions
  WHERE id = ANY(session_ids);
  GET DIAGNOSTICS deleted_sessions = ROW_COUNT;

  RETURN jsonb_build_object(
    'deleted_sessions', deleted_sessions,
    'deleted_teams', deleted_teams,
    'deleted_turn_events', deleted_turn_events,
    'cutoff_date', cutoff_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_old_games(integer) TO anon;
GRANT EXECUTE ON FUNCTION cleanup_old_games(integer) TO authenticated;
