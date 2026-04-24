-- ============================================================================
-- v2マイグレーション: 個人参加・チーム戦・同時プレイ対応
-- ============================================================================

-- 1. game_sessions に新カラム追加
ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS play_mode TEXT NOT NULL DEFAULT 'individual'
    CHECK (play_mode IN ('individual', 'team')),
  ADD COLUMN IF NOT EXISTS progress_mode TEXT NOT NULL DEFAULT 'simultaneous'
    CHECK (progress_mode IN ('turn_based', 'simultaneous')),
  ADD COLUMN IF NOT EXISTS answer_rule TEXT NOT NULL DEFAULT 'anyone'
    CHECK (answer_rule IN ('anyone', 'unanimous')),
  ADD COLUMN IF NOT EXISTS max_players INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS team_count INTEGER DEFAULT 4;

-- status に 'team_forming' を追加
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_status_check;
ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_status_check
    CHECK (status IN ('waiting', 'team_forming', 'playing', 'finished'));

-- 2. teams に is_individual カラム追加
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS is_individual BOOLEAN DEFAULT FALSE;

-- 3. players テーブル作成
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  is_online BOOLEAN DEFAULT TRUE,
  is_spectator BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_session_id, player_name)
);

CREATE INDEX IF NOT EXISTS idx_players_session ON players(game_session_id);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);

ALTER TABLE players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read players" ON players FOR SELECT USING (TRUE);
CREATE POLICY "Allow insert players" ON players FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Allow update players" ON players FOR UPDATE USING (TRUE);
CREATE POLICY "Allow delete players" ON players FOR DELETE USING (TRUE);

ALTER PUBLICATION supabase_realtime ADD TABLE players;

-- 4. player_answers テーブル作成
CREATE TABLE IF NOT EXISTS player_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  selected_answer CHAR(1) CHECK (selected_answer IN ('A', 'B', 'C', 'D')),
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_session_id, player_id, turn_number)
);

CREATE INDEX IF NOT EXISTS idx_player_answers_team_turn ON player_answers(team_id, turn_number);

ALTER TABLE player_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read player_answers" ON player_answers FOR SELECT USING (TRUE);
CREATE POLICY "Allow insert player_answers" ON player_answers FOR INSERT WITH CHECK (TRUE);

ALTER PUBLICATION supabase_realtime ADD TABLE player_answers;
