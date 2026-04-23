/**
 * 盤面レイアウト計算
 * すごろくの蛇行パス（右→折返し→左→折返し...）を生成
 */

export type BoardPosition = {
  cellNumber: number;
  x: number; // 0-based column
  y: number; // 0-based row
};

/**
 * 蛇行パス座標を生成する
 * @param totalCells - マスの総数（スタート+ゴール含む）
 * @param columns - 横に並べるマスの数（デフォルト5）
 * @returns 各マスの座標配列
 */
export function generateBoardLayout(
  totalCells: number,
  columns: number = 5,
): BoardPosition[] {
  const positions: BoardPosition[] = [];
  const rows = Math.ceil(totalCells / columns);

  for (let i = 0; i < totalCells; i++) {
    const row = Math.floor(i / columns);
    const colInRow = i % columns;
    // 偶数行: 左→右、奇数行: 右→左
    const x = row % 2 === 0 ? colInRow : columns - 1 - colInRow;
    // 盤面は下から上に進む（row 0 = 最下行）
    const y = rows - 1 - row;

    positions.push({ cellNumber: i, x, y });
  }

  return positions;
}

/**
 * マスのタイプに応じた色を返す
 */
export function getCellColor(cellType: string): string {
  switch (cellType) {
    case 'スタート': return '#22C55E';  // green
    case 'ゴール': return '#EF4444';    // red
    case 'イベント': return '#F59E0B';  // amber
    case 'ボーナス': return '#8B5CF6';  // purple
    case '通常':
    default: return '#3B82F6';           // blue
  }
}

/**
 * マスのタイプに応じた絵文字を返す
 */
export function getCellEmoji(cellType: string): string {
  switch (cellType) {
    case 'スタート': return '🏁';
    case 'ゴール': return '🎯';
    case 'イベント': return '⭐';
    case 'ボーナス': return '🎁';
    case '通常':
    default: return '❓';
  }
}
