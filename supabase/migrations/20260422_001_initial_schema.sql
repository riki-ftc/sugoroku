-- ============================================================================
-- すごろくクイズゲーム データベーススキーマ
-- 
-- 設計方針：
-- - マスター系（問題・マス・アクション）と ゲーム系（セッション・チーム・履歴）を分離
-- - マスター系はバージョン管理（ゲームセットの切り替えが可能）
-- - ゲーム系はリアルタイム同期対象
-- - RLS(Row Level Security)を有効化、anon key で読み書き可能（ゲームコードで分離）
-- ============================================================================

-- ============================================================================
-- マスター系テーブル
-- ============================================================================

-- ゲームセット：マス・問題・アクションのひとまとまり
-- 例：「理科クイズすごろく」「社会クイズすごろく」を切り替え可能に
CREATE TABLE game_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                        -- 例：「理科クイズすごろく」
  description TEXT,
  dice_sides INTEGER NOT NULL DEFAULT 6,    -- サイコロの面数
  dice_count INTEGER NOT NULL DEFAULT 1,    -- サイコロの個数
  answer_time_limit INTEGER DEFAULT 30,     -- 回答制限時間（秒）0なら無制限
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- マス定義
CREATE TABLE cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_set_id UUID NOT NULL REFERENCES game_sets(id) ON DELETE CASCADE,
  cell_number INTEGER NOT NULL,              -- マス番号（0=スタート）
  cell_type TEXT NOT NULL CHECK (cell_type IN ('スタート', '通常', 'イベント', 'ボーナス', 'ゴール')),
  label TEXT,                                 -- 表示テキスト
  quiz_id UUID,                               -- FK は quizzes 作成後に ALTER TABLE で追加
  correct_action_id UUID,                    -- アクションID（自己参照予防のため外部キー後付け）
  wrong_action_id UUID,
  memo TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_set_id, cell_number)
);

-- 問題
CREATE TABLE quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_set_id UUID NOT NULL REFERENCES game_sets(id) ON DELETE CASCADE,
  quiz_code TEXT NOT NULL,                   -- 'Q001' などスプレッドシートの問題ID
  category TEXT,
  difficulty TEXT CHECK (difficulty IN ('易', '中', '難')),
  question TEXT NOT NULL,
  choice_a TEXT NOT NULL,
  choice_b TEXT NOT NULL,
  choice_c TEXT,
  choice_d TEXT,
  answer CHAR(1) NOT NULL CHECK (answer IN ('A', 'B', 'C', 'D')),
  explanation TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_set_id, quiz_code)
);

-- アクション
CREATE TABLE actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_set_id UUID NOT NULL REFERENCES game_sets(id) ON DELETE CASCADE,
  action_code TEXT NOT NULL,                 -- 'ACT_ADVANCE_2' などスプレッドシートのアクションID
  action_type TEXT NOT NULL CHECK (action_type IN ('進む', '戻る', 'スタートへ戻る', 'ゴールへ', 'スキップ', 'もう一度', '1回休み', 'なし')),
  value INTEGER DEFAULT 0,                   -- マス数・ターン数
  message TEXT,                              -- 表示メッセージ
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_set_id, action_code)
);

-- cells と quizzes/actions の外部キー制約を追加
ALTER TABLE cells 
  ADD CONSTRAINT cells_quiz_fk FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE SET NULL;
ALTER TABLE cells 
  ADD CONSTRAINT cells_correct_action_fk FOREIGN KEY (correct_action_id) REFERENCES actions(id) ON DELETE SET NULL;
ALTER TABLE cells 
  ADD CONSTRAINT cells_wrong_action_fk FOREIGN KEY (wrong_action_id) REFERENCES actions(id) ON DELETE SET NULL;

-- ============================================================================
-- ゲーム系テーブル（リアルタイム同期対象）
-- ============================================================================

-- ゲームセッション：先生が発行する1回のゲーム
CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code TEXT UNIQUE NOT NULL,            -- 6桁のゲームコード（例：ABC123）
  game_set_id UUID NOT NULL REFERENCES game_sets(id),
  host_name TEXT,                            -- 先生の名前（任意）
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  current_turn_team_id UUID,                 -- 現在ターンのチーム（後付け外部キー）
  turn_number INTEGER DEFAULT 0,             -- 通算ターン数
  max_teams INTEGER DEFAULT 8,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'  -- 24時間で自動無効化
);

-- チーム（ゲームセッション内の参加チーム）
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  team_color TEXT,                           -- 表示色（自動割当）
  team_emoji TEXT,                           -- アバター絵文字
  turn_order INTEGER,                        -- ターン順（参加順）
  current_position INTEGER DEFAULT 0,        -- 現在のマス位置
  correct_count INTEGER DEFAULT 0,
  skip_tokens INTEGER DEFAULT 0,             -- スキップ券の残数
  pause_turns INTEGER DEFAULT 0,             -- 休みの残ターン
  roll_again BOOLEAN DEFAULT FALSE,          -- 次回もう一度振れる
  is_finished BOOLEAN DEFAULT FALSE,         -- ゴール済みか
  finished_turn INTEGER,                     -- ゴールしたターン
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_session_id, team_name)
);

-- game_sessions.current_turn_team_id の外部キーを後付け
ALTER TABLE game_sessions 
  ADD CONSTRAINT game_sessions_current_team_fk 
  FOREIGN KEY (current_turn_team_id) REFERENCES teams(id) ON DELETE SET NULL;

-- ターンイベント（履歴・リプレイ用）
CREATE TABLE turn_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  event_type TEXT NOT NULL,                  -- 'dice_roll', 'move', 'answer', 'action'
  payload JSONB NOT NULL,                    -- 各イベントの詳細データ
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- インデックス
-- ============================================================================
CREATE INDEX idx_cells_game_set ON cells(game_set_id, cell_number);
CREATE INDEX idx_quizzes_game_set ON quizzes(game_set_id);
CREATE INDEX idx_actions_game_set ON actions(game_set_id);
CREATE INDEX idx_game_sessions_code ON game_sessions(game_code) WHERE status != 'finished';
CREATE INDEX idx_teams_session ON teams(game_session_id, turn_order);
CREATE INDEX idx_turn_events_session ON turn_events(game_session_id, turn_number);

-- ============================================================================
-- Realtime（リアルタイム購読）を有効化
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE turn_events;

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

-- マスター系：anonロールで読み取り可、書き込みは認証必要（管理画面から）
ALTER TABLE game_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;

-- 誰でも読める（参加する生徒が必要なため）
CREATE POLICY "Allow read master data" ON game_sets FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Allow read cells" ON cells FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Allow read quizzes" ON quizzes FOR SELECT USING (is_active = TRUE);
CREATE POLICY "Allow read actions" ON actions FOR SELECT USING (is_active = TRUE);

-- ゲーム系：プロトタイプ段階では anon で読み書き可能（ゲームコードで分離）
-- 本番では更に絞る（例：ゲームコード認証済みのsessionのみ書き込み可、等）
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE turn_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read game sessions" ON game_sessions FOR SELECT USING (TRUE);
CREATE POLICY "Allow insert game sessions" ON game_sessions FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Allow update game sessions" ON game_sessions FOR UPDATE USING (TRUE);

CREATE POLICY "Allow read teams" ON teams FOR SELECT USING (TRUE);
CREATE POLICY "Allow insert teams" ON teams FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Allow update teams" ON teams FOR UPDATE USING (TRUE);

CREATE POLICY "Allow read turn events" ON turn_events FOR SELECT USING (TRUE);
CREATE POLICY "Allow insert turn events" ON turn_events FOR INSERT WITH CHECK (TRUE);

-- マスター書き込みは認証ユーザーのみ（後で管理画面と接続）
CREATE POLICY "Authenticated write game sets" ON game_sets FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write cells" ON cells FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write quizzes" ON quizzes FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated write actions" ON actions FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- ユーティリティ関数
-- ============================================================================

-- ゲームコード自動生成関数（重複しないものを返す）
CREATE OR REPLACE FUNCTION generate_game_code() RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 紛らわしい文字(0,O,1,I,L)を除外
  code TEXT;
  i INTEGER;
  existing_count INTEGER;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, floor(random() * length(chars))::integer + 1, 1);
    END LOOP;
    
    SELECT COUNT(*) INTO existing_count 
    FROM game_sessions 
    WHERE game_code = code AND status != 'finished';
    
    EXIT WHEN existing_count = 0;
  END LOOP;
  
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- 期限切れゲームセッションを自動無効化する関数
CREATE OR REPLACE FUNCTION cleanup_expired_sessions() RETURNS void AS $$
BEGIN
  UPDATE game_sessions 
  SET status = 'finished' 
  WHERE expires_at < NOW() AND status != 'finished';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- updated_at自動更新トリガー
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER game_sets_updated_at BEFORE UPDATE ON game_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
