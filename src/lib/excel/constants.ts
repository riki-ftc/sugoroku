/**
 * Excel テンプレートのシート名 → DB テーブル名のマッピングと列定義
 */

// ---------- シート名定数 ----------
export const SHEET_NAMES = {
  README: 'はじめに',
  GAME_SETTINGS: 'ゲーム設定',
  CELLS: 'マス設定',
  QUIZZES: '問題',
  ACTIONS: 'アクション',
} as const;

/** インポート必須シート（「はじめに」は不要） */
export const REQUIRED_SHEETS = [
  SHEET_NAMES.GAME_SETTINGS,
  SHEET_NAMES.CELLS,
  SHEET_NAMES.QUIZZES,
  SHEET_NAMES.ACTIONS,
] as const;

// ---------- ゲーム設定シートのキー ----------
export const GAME_SETTING_KEYS = {
  TITLE: 'ゲームタイトル',
  DESCRIPTION: '説明',
  DICE_SIDES: 'サイコロの面数',
  DICE_COUNT: 'サイコロ個数',
  ANSWER_TIME_LIMIT: '回答制限時間（秒）',
} as const;

// ---------- マス設定シートのヘッダー ----------
export const CELL_HEADERS = [
  'マス番号',
  'マス種別',
  '表示テキスト',
  '問題ID',
  '正解時アクションID',
  '不正解時アクションID',
  '有効フラグ',
  'メモ',
] as const;

// ---------- 問題シートのヘッダー ----------
export const QUIZ_HEADERS = [
  '問題ID',
  'カテゴリ',
  '難易度',
  '問題文',
  '選択肢A',
  '選択肢B',
  '選択肢C',
  '選択肢D',
  '正解',
  '解説',
  '有効フラグ',
] as const;

// ---------- アクションシートのヘッダー ----------
export const ACTION_HEADERS = [
  'アクションID',
  'タイプ',
  '値',
  '表示メッセージ',
  '有効フラグ',
  '説明',
] as const;

// ---------- 値のバリデーション用 ----------

/** マス種別 → DB の cell_type 変換マップ */
export const CELL_TYPE_MAP: Record<string, string> = {
  start: 'スタート',
  quiz: '通常',
  event: 'イベント',
  bonus: 'ボーナス',
  goal: 'ゴール',
  スタート: 'スタート',
  通常: '通常',
  イベント: 'イベント',
  ボーナス: 'ボーナス',
  ゴール: 'ゴール',
};

/** アクションタイプ → DB の action_type 変換マップ */
export const ACTION_TYPE_MAP: Record<string, string> = {
  advance: '進む',
  back: '戻る',
  back_to_start: 'スタートへ戻る',
  go_to_goal: 'ゴールへ',
  skip_next: 'スキップ',
  extra_turn: 'もう一度',
  rest: '1回休み',
  none: 'なし',
  進む: '進む',
  戻る: '戻る',
  'スタートへ戻る': 'スタートへ戻る',
  ゴールへ: 'ゴールへ',
  スキップ: 'スキップ',
  もう一度: 'もう一度',
  '1回休み': '1回休み',
  なし: 'なし',
};

export const VALID_ANSWERS = ['A', 'B', 'C', 'D'] as const;
export const VALID_DIFFICULTIES = ['易', '中', '難'] as const;
