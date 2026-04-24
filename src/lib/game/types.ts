// ゲーム進行で使用する型定義

export type CellType = 'スタート' | '通常' | 'イベント' | 'ボーナス' | 'ゴール';
export type ActionType = '進む' | '戻る' | 'スタートへ戻る' | 'ゴールへ' | 'スキップ' | 'もう一度' | '1回休み' | 'なし';
export type Difficulty = '易' | '中' | '難';
export type PlayMode = 'individual' | 'team';
export type ProgressMode = 'turn_based' | 'simultaneous';
export type AnswerRule = 'anyone' | 'unanimous';

export type Cell = {
  id: string;
  game_set_id: string;
  cell_number: number;
  cell_type: CellType;
  label: string | null;
  quiz_id: string | null;
  correct_action_id: string | null;
  wrong_action_id: string | null;
  memo: string | null;
};

export type Quiz = {
  id: string;
  game_set_id: string;
  quiz_code: string;
  category: string | null;
  difficulty: Difficulty | null;
  question: string;
  choice_a: string;
  choice_b: string;
  choice_c: string | null;
  choice_d: string | null;
  answer: 'A' | 'B' | 'C' | 'D';
  explanation: string | null;
};

export type Action = {
  id: string;
  game_set_id: string;
  action_code: string;
  action_type: ActionType;
  value: number;
  message: string | null;
};

export type GameSession = {
  id: string;
  game_code: string;
  game_set_id: string;
  host_name: string | null;
  status: 'waiting' | 'team_forming' | 'playing' | 'finished';
  current_turn_team_id: string | null;
  turn_number: number;
  max_teams: number;
  // v2 フィールド
  play_mode: PlayMode;
  progress_mode: ProgressMode;
  answer_rule: AnswerRule;
  max_players: number;
  team_count: number;
  //
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  expires_at: string;
};

export type Team = {
  id: string;
  game_session_id: string;
  team_name: string;
  team_color: string | null;
  team_emoji: string | null;
  turn_order: number | null;
  current_position: number;
  correct_count: number;
  skip_tokens: number;
  pause_turns: number;
  roll_again: boolean;
  is_finished: boolean;
  finished_turn: number | null;
  is_individual: boolean;
  joined_at: string;
};

export type Player = {
  id: string;
  game_session_id: string;
  player_name: string;
  team_id: string | null;
  is_spectator: boolean;
  is_online: boolean;
  joined_at: string;
};

export type GameSet = {
  id: string;
  name: string;
  description: string | null;
  dice_sides: number;
  dice_count: number;
  answer_time_limit: number | null;
};

// sessionStorage に保存するプレイヤー情報
export type StoredPlayerInfo = {
  playerId: string;
  playerName: string;
  teamId: string | null;
  teamName: string | null;
  teamColor: string | null;
  teamEmoji: string | null;
};

// ターン中のフェーズ
export type TurnPhase =
  | 'roll'       // サイコロ待ち
  | 'moving'     // 移動アニメーション中
  | 'quiz'       // クイズ出題中
  | 'result'     // 正解/不正解表示
  | 'action'     // アクション実行中
  | 'next';      // ターン遷移中

export type TurnState = {
  phase: TurnPhase;
  diceValue: number | null;
  targetPosition: number;
  currentCell: Cell | null;
  currentQuiz: Quiz | null;
  selectedAnswer: string | null;
  isCorrect: boolean | null;
  actionToApply: Action | null;
  actionMessage: string | null;
};

export const INITIAL_TURN_STATE: TurnState = {
  phase: 'roll',
  diceValue: null,
  targetPosition: 0,
  currentCell: null,
  currentQuiz: null,
  selectedAnswer: null,
  isCorrect: null,
  actionToApply: null,
  actionMessage: null,
};
