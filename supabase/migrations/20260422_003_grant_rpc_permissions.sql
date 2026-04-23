-- ============================================================================
-- セッション4: generate_game_code を anon role から実行可能にする
-- 
-- 初期マイグレーションでは SECURITY INVOKER（デフォルト）で作成されたため
-- anon roleに実行権限がない。ゲーム作成画面は先生がログインなしでも
-- 使えるようにプロトタイプ段階では anon で許可する。
-- ============================================================================

-- anon role に RPC 実行権限を付与
GRANT EXECUTE ON FUNCTION generate_game_code() TO anon;
GRANT EXECUTE ON FUNCTION generate_game_code() TO authenticated;

-- cleanup_expired_sessions も将来の自動実行用に権限付与
GRANT EXECUTE ON FUNCTION cleanup_expired_sessions() TO anon;
GRANT EXECUTE ON FUNCTION cleanup_expired_sessions() TO authenticated;
