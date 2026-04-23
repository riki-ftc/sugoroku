import type { Cell, Team, Action, ActionType } from './types';

/**
 * サイコロを振る（1〜sides の乱数を count 回）
 */
export function rollDice(sides: number = 6, count: number = 1): number {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return total;
}

/**
 * 移動先のマス番号を計算する
 * ゴールを超えたらゴール番号で止まる
 */
export function calculateTargetPosition(
  currentPos: number,
  diceValue: number,
  maxCellNumber: number,
): number {
  const target = currentPos + diceValue;
  return Math.min(target, maxCellNumber);
}

/**
 * アクションを適用した後のチーム状態を計算する
 * DBへの書き込みはしない。純粋な計算のみ。
 */
export function applyAction(
  team: Team,
  action: Action,
  maxCellNumber: number,
): Partial<Team> {
  const updates: Partial<Team> = {};

  switch (action.action_type as ActionType) {
    case '進む':
      updates.current_position = Math.min(
        team.current_position + action.value,
        maxCellNumber,
      );
      break;
    case '戻る':
      updates.current_position = Math.max(
        team.current_position - action.value,
        0,
      );
      break;
    case 'スタートへ戻る':
      updates.current_position = 0;
      break;
    case 'ゴールへ':
      updates.current_position = maxCellNumber;
      updates.is_finished = true;
      break;
    case 'スキップ':
      updates.skip_tokens = (team.skip_tokens ?? 0) + (action.value || 1);
      break;
    case 'もう一度':
      updates.roll_again = true;
      break;
    case '1回休み':
      updates.pause_turns = (team.pause_turns ?? 0) + (action.value || 1);
      break;
    case 'なし':
      // 何もしない
      break;
  }

  // ゴールに到達したかチェック
  if (updates.current_position !== undefined && updates.current_position >= maxCellNumber) {
    updates.current_position = maxCellNumber;
    updates.is_finished = true;
  }

  return updates;
}

/**
 * 次のターンのチームを決定する
 * - 全チームゴール済み → null（ゲーム終了）
 * - もう一度フラグ → 同じチーム
 * - 休みターン → スキップ
 */
export function getNextTurnTeam(
  teams: Team[],
  currentTeamId: string,
): Team | null {
  const activeTeams = teams
    .filter((t) => !t.is_finished)
    .sort((a, b) => (a.turn_order ?? 0) - (b.turn_order ?? 0));

  if (activeTeams.length === 0) return null; // ゲーム終了

  // 現在のチームが「もう一度」の場合
  const currentTeam = teams.find((t) => t.id === currentTeamId);
  if (currentTeam && currentTeam.roll_again && !currentTeam.is_finished) {
    return currentTeam;
  }

  // 次のアクティブチームを探す
  const currentOrder = currentTeam?.turn_order ?? 0;
  let nextTeam: Team | null = null;

  // 現在のチームより後ろで、アクティブかつ休みでないチームを探す
  for (const t of activeTeams) {
    if ((t.turn_order ?? 0) > currentOrder && t.pause_turns <= 0) {
      nextTeam = t;
      break;
    }
  }

  // 見つからなければ先頭に戻って探す
  if (!nextTeam) {
    for (const t of activeTeams) {
      if (t.pause_turns <= 0) {
        nextTeam = t;
        break;
      }
    }
  }

  // 全員休みの場合（レアケース）→ 休みターンを消費して再試行
  if (!nextTeam && activeTeams.length > 0) {
    nextTeam = activeTeams[0];
  }

  return nextTeam;
}

/**
 * マス番号からセルデータを取得する
 */
export function getCellByNumber(cells: Cell[], cellNumber: number): Cell | undefined {
  return cells.find((c) => c.cell_number === cellNumber);
}

/**
 * ゲーム終了条件をチェック
 * true = ゲーム終了
 */
export function isGameFinished(teams: Team[]): boolean {
  return teams.every((t) => t.is_finished);
}
