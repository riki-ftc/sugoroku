-- ============================================================================
-- 関数の search_path を固定
-- 
-- Supabase Security Advisor の警告（function_search_path_mutable）への対応。
-- search_path が可変のままだとプリペアドSQL等でスキーマ偽装される恐れがあるため、
-- public と pg_temp に固定する。
-- ============================================================================

ALTER FUNCTION public.generate_game_code() SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_expired_sessions() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at() SET search_path = public, pg_temp;
