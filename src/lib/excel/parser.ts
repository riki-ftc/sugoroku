/**
 * Excel → JSON パーサー
 *
 * クライアントサイドで xlsx パッケージを使い、
 * Excelテンプレートを各テーブル用のJSONに変換する。
 */
import * as XLSX from 'xlsx';
import {
  SHEET_NAMES,
  GAME_SETTING_KEYS,
  CELL_HEADERS,
  QUIZ_HEADERS,
  ACTION_HEADERS,
} from './constants';

// ---------- 型定義 ----------

export interface GameSettingsRow {
  name: string;
  description: string;
  diceSides: number;
  diceCount: number;
  answerTimeLimit: number;
}

export interface CellRow {
  cellNumber: number;
  cellType: string;
  label: string;
  quizCode: string;
  correctActionCode: string;
  wrongActionCode: string;
  isActive: boolean;
  memo: string;
}

export interface QuizRow {
  quizCode: string;
  category: string;
  difficulty: string;
  question: string;
  choiceA: string;
  choiceB: string;
  choiceC: string;
  choiceD: string;
  answer: string;
  explanation: string;
  isActive: boolean;
}

export interface ActionRow {
  actionCode: string;
  actionType: string;
  value: number;
  message: string;
  isActive: boolean;
  description: string;
}

export interface ParsedData {
  gameSettings: GameSettingsRow;
  cells: CellRow[];
  quizzes: QuizRow[];
  actions: ActionRow[];
}

// ---------- ユーティリティ ----------

/** セルの値を文字列として取得（null-safe） */
function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** セルの値を整数として取得 */
function int(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

/** TRUE/FALSE/1/0 → boolean */
function bool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  const s = str(v).toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'はい';
}

// ---------- メインパーサー ----------

/**
 * ArrayBuffer (File.arrayBuffer()) を受け取り、パース結果を返す
 */
export function parseExcel(buffer: ArrayBuffer): ParsedData {
  const wb = XLSX.read(buffer, { type: 'array' });

  return {
    gameSettings: parseGameSettings(wb),
    cells: parseCells(wb),
    quizzes: parseQuizzes(wb),
    actions: parseActions(wb),
  };
}

// ---------- 各シートパーサー ----------

function parseGameSettings(wb: XLSX.WorkBook): GameSettingsRow {
  const ws = wb.Sheets[SHEET_NAMES.GAME_SETTINGS];
  if (!ws) throw new Error(`シート「${SHEET_NAMES.GAME_SETTINGS}」が見つかりません`);

  // キー・バリュー形式：A列=キー、B列=値（header: 1 で配列の配列として取得）
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown as unknown[][];

  const kv = new Map<string, unknown>();
  for (const row of rows) {
    if (row.length >= 2) kv.set(str(row[0]), row[1]);
  }

  return {
    name: str(kv.get(GAME_SETTING_KEYS.TITLE)) || '無題のゲーム',
    description: str(kv.get(GAME_SETTING_KEYS.DESCRIPTION)),
    diceSides: int(kv.get(GAME_SETTING_KEYS.DICE_SIDES), 6),
    diceCount: int(kv.get(GAME_SETTING_KEYS.DICE_COUNT), 1),
    answerTimeLimit: int(kv.get(GAME_SETTING_KEYS.ANSWER_TIME_LIMIT), 30),
  };
}

function parseCells(wb: XLSX.WorkBook): CellRow[] {
  const ws = wb.Sheets[SHEET_NAMES.CELLS];
  if (!ws) throw new Error(`シート「${SHEET_NAMES.CELLS}」が見つかりません`);

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    header: [...CELL_HEADERS],
    range: 1, // ヘッダー行をスキップ
  });

  return rows.map((r) => ({
    cellNumber: int(r[CELL_HEADERS[0]]),
    cellType: str(r[CELL_HEADERS[1]]),
    label: str(r[CELL_HEADERS[2]]),
    quizCode: str(r[CELL_HEADERS[3]]),
    correctActionCode: str(r[CELL_HEADERS[4]]),
    wrongActionCode: str(r[CELL_HEADERS[5]]),
    isActive: bool(r[CELL_HEADERS[6]] ?? true),
    memo: str(r[CELL_HEADERS[7]]),
  }));
}

function parseQuizzes(wb: XLSX.WorkBook): QuizRow[] {
  const ws = wb.Sheets[SHEET_NAMES.QUIZZES];
  if (!ws) throw new Error(`シート「${SHEET_NAMES.QUIZZES}」が見つかりません`);

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    header: [...QUIZ_HEADERS],
    range: 1,
  });

  return rows.map((r) => ({
    quizCode: str(r[QUIZ_HEADERS[0]]),
    category: str(r[QUIZ_HEADERS[1]]),
    difficulty: str(r[QUIZ_HEADERS[2]]),
    question: str(r[QUIZ_HEADERS[3]]),
    choiceA: str(r[QUIZ_HEADERS[4]]),
    choiceB: str(r[QUIZ_HEADERS[5]]),
    choiceC: str(r[QUIZ_HEADERS[6]]),
    choiceD: str(r[QUIZ_HEADERS[7]]),
    answer: str(r[QUIZ_HEADERS[8]]).toUpperCase(),
    explanation: str(r[QUIZ_HEADERS[9]]),
    isActive: bool(r[QUIZ_HEADERS[10]] ?? true),
  }));
}

function parseActions(wb: XLSX.WorkBook): ActionRow[] {
  const ws = wb.Sheets[SHEET_NAMES.ACTIONS];
  if (!ws) throw new Error(`シート「${SHEET_NAMES.ACTIONS}」が見つかりません`);

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    header: [...ACTION_HEADERS],
    range: 1,
  });

  return rows.map((r) => ({
    actionCode: str(r[ACTION_HEADERS[0]]),
    actionType: str(r[ACTION_HEADERS[1]]),
    value: int(r[ACTION_HEADERS[2]]),
    message: str(r[ACTION_HEADERS[3]]),
    isActive: bool(r[ACTION_HEADERS[4]] ?? true),
    description: str(r[ACTION_HEADERS[5]]),
  }));
}
