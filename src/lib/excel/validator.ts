/**
 * パース済みデータのバリデーション
 *
 * エラー（致命的 → インポート不可）と警告（インポートは可）を返す。
 */
import type { ParsedData, CellRow, QuizRow, ActionRow } from './parser';
import {
  CELL_TYPE_MAP,
  ACTION_TYPE_MAP,
  VALID_ANSWERS,
  VALID_DIFFICULTIES,
} from './constants';

export interface ValidationMessage {
  level: 'error' | 'warning';
  sheet: string;
  row?: number;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  messages: ValidationMessage[];
  /** エラー数 */
  errorCount: number;
  /** 警告数 */
  warningCount: number;
}

export function validate(data: ParsedData): ValidationResult {
  const msgs: ValidationMessage[] = [];

  validateGameSettings(data, msgs);
  validateQuizzes(data.quizzes, msgs);
  validateActions(data.actions, msgs);
  validateCells(data, msgs);

  const errorCount = msgs.filter((m) => m.level === 'error').length;
  const warningCount = msgs.filter((m) => m.level === 'warning').length;

  return { ok: errorCount === 0, messages: msgs, errorCount, warningCount };
}

// ---------- ゲーム設定 ----------

function validateGameSettings(data: ParsedData, msgs: ValidationMessage[]) {
  const gs = data.gameSettings;
  if (!gs.name) {
    msgs.push({ level: 'error', sheet: 'ゲーム設定', message: 'ゲームタイトルが空です' });
  }
  if (gs.diceSides < 1 || gs.diceSides > 20) {
    msgs.push({ level: 'warning', sheet: 'ゲーム設定', message: `サイコロの面数が ${gs.diceSides} です（通常は6）` });
  }
}

// ---------- 問題 ----------

function validateQuizzes(quizzes: QuizRow[], msgs: ValidationMessage[]) {
  const codes = new Set<string>();

  quizzes.forEach((q, i) => {
    const row = i + 2; // ヘッダー行 + 0-indexed
    if (!q.quizCode) {
      msgs.push({ level: 'error', sheet: '問題', row, message: '問題IDが空です' });
      return;
    }
    if (codes.has(q.quizCode)) {
      msgs.push({ level: 'error', sheet: '問題', row, message: `問題ID「${q.quizCode}」が重複しています` });
    }
    codes.add(q.quizCode);

    if (!q.question) {
      msgs.push({ level: 'error', sheet: '問題', row, message: `${q.quizCode}: 問題文が空です` });
    }
    if (!q.choiceA || !q.choiceB) {
      msgs.push({ level: 'error', sheet: '問題', row, message: `${q.quizCode}: 選択肢A/Bは必須です` });
    }
    if (!VALID_ANSWERS.includes(q.answer as typeof VALID_ANSWERS[number])) {
      msgs.push({ level: 'error', sheet: '問題', row, message: `${q.quizCode}: 正解は A/B/C/D のいずれかにしてください（現在: ${q.answer || '空'}）` });
    }
    if (q.difficulty && !VALID_DIFFICULTIES.includes(q.difficulty as typeof VALID_DIFFICULTIES[number])) {
      msgs.push({ level: 'warning', sheet: '問題', row, message: `${q.quizCode}: 難易度「${q.difficulty}」は易/中/難のいずれかを推奨` });
    }
  });
}

// ---------- アクション ----------

function validateActions(actions: ActionRow[], msgs: ValidationMessage[]) {
  const codes = new Set<string>();

  actions.forEach((a, i) => {
    const row = i + 2;
    if (!a.actionCode) {
      msgs.push({ level: 'error', sheet: 'アクション', row, message: 'アクションIDが空です' });
      return;
    }
    if (codes.has(a.actionCode)) {
      msgs.push({ level: 'error', sheet: 'アクション', row, message: `アクションID「${a.actionCode}」が重複しています` });
    }
    codes.add(a.actionCode);

    if (!(a.actionType in ACTION_TYPE_MAP)) {
      msgs.push({
        level: 'error',
        sheet: 'アクション',
        row,
        message: `${a.actionCode}: タイプ「${a.actionType}」は不明です（有効値: ${Object.keys(ACTION_TYPE_MAP).join(', ')}）`,
      });
    }
    if (!a.message) {
      msgs.push({ level: 'warning', sheet: 'アクション', row, message: `${a.actionCode}: 表示メッセージが空です` });
    }
  });
}

// ---------- マス設定 ----------

function validateCells(data: ParsedData, msgs: ValidationMessage[]) {
  const cells = data.cells;
  const quizCodes = new Set(data.quizzes.map((q) => q.quizCode));
  const actionCodes = new Set(data.actions.map((a) => a.actionCode));
  const cellNumbers = new Set<number>();

  // スタートとゴールの存在確認
  const hasStart = cells.some((c) => {
    const t = CELL_TYPE_MAP[c.cellType];
    return t === 'スタート';
  });
  const hasGoal = cells.some((c) => {
    const t = CELL_TYPE_MAP[c.cellType];
    return t === 'ゴール';
  });
  if (!hasStart) msgs.push({ level: 'error', sheet: 'マス設定', message: 'スタートマスがありません' });
  if (!hasGoal) msgs.push({ level: 'error', sheet: 'マス設定', message: 'ゴールマスがありません' });

  cells.forEach((c, i) => {
    const row = i + 2;

    // マス番号重複
    if (cellNumbers.has(c.cellNumber)) {
      msgs.push({ level: 'error', sheet: 'マス設定', row, message: `マス番号 ${c.cellNumber} が重複しています` });
    }
    cellNumbers.add(c.cellNumber);

    // マス種別チェック
    if (!(c.cellType in CELL_TYPE_MAP)) {
      msgs.push({
        level: 'error',
        sheet: 'マス設定',
        row,
        message: `マス種別「${c.cellType}」は不明です`,
      });
    }

    // 問題IDの参照整合性
    if (c.quizCode && !quizCodes.has(c.quizCode)) {
      msgs.push({
        level: 'error',
        sheet: 'マス設定',
        row,
        message: `問題ID「${c.quizCode}」が問題シートに存在しません`,
      });
    }

    // アクションIDの参照整合性
    if (c.correctActionCode && !actionCodes.has(c.correctActionCode)) {
      msgs.push({
        level: 'error',
        sheet: 'マス設定',
        row,
        message: `正解時アクションID「${c.correctActionCode}」がアクションシートに存在しません`,
      });
    }
    if (c.wrongActionCode && !actionCodes.has(c.wrongActionCode)) {
      msgs.push({
        level: 'error',
        sheet: 'マス設定',
        row,
        message: `不正解時アクションID「${c.wrongActionCode}」がアクションシートに存在しません`,
      });
    }
  });

  // マス番号が 0 から連番かチェック
  const sorted = [...cellNumbers].sort((a, b) => a - b);
  if (sorted.length > 0 && sorted[0] !== 0) {
    msgs.push({ level: 'warning', sheet: 'マス設定', message: 'マス番号が 0 から始まっていません' });
  }
  for (let j = 1; j < sorted.length; j++) {
    if (sorted[j] !== sorted[j - 1] + 1) {
      msgs.push({
        level: 'warning',
        sheet: 'マス設定',
        message: `マス番号に欠番があります（${sorted[j - 1]} → ${sorted[j]}）`,
      });
      break;
    }
  }
}
