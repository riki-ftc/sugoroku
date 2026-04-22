/**
 * パース・バリデーション済みデータを Supabase に投入する
 *
 * 投入順序: game_sets → quizzes → actions → cells
 * cells の quiz_id / action_id は quiz_code / action_code から解決
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedData } from './parser';
import { CELL_TYPE_MAP, ACTION_TYPE_MAP } from './constants';

export interface ImportResult {
  success: boolean;
  gameSetId?: string;
  counts?: {
    quizzes: number;
    actions: number;
    cells: number;
  };
  error?: string;
}

export async function importToSupabase(
  supabase: SupabaseClient,
  data: ParsedData,
): Promise<ImportResult> {
  try {
    // 1. game_sets 作成
    const { data: gameSet, error: gsErr } = await supabase
      .from('game_sets')
      .insert({
        name: data.gameSettings.name,
        description: data.gameSettings.description || null,
        dice_sides: data.gameSettings.diceSides,
        dice_count: data.gameSettings.diceCount,
        answer_time_limit: data.gameSettings.answerTimeLimit,
      })
      .select('id')
      .single();

    if (gsErr || !gameSet) {
      return { success: false, error: `ゲームセット作成失敗: ${gsErr?.message}` };
    }

    const gameSetId = gameSet.id as string;

    // 2. quizzes 作成
    const activeQuizzes = data.quizzes.filter((q) => q.isActive);
    const quizInserts = activeQuizzes.map((q) => ({
      game_set_id: gameSetId,
      quiz_code: q.quizCode,
      category: q.category || null,
      difficulty: q.difficulty || null,
      question: q.question,
      choice_a: q.choiceA,
      choice_b: q.choiceB,
      choice_c: q.choiceC || null,
      choice_d: q.choiceD || null,
      answer: q.answer,
      explanation: q.explanation || null,
    }));

    let quizMap = new Map<string, string>(); // quiz_code → uuid
    if (quizInserts.length > 0) {
      const { data: quizzes, error: qErr } = await supabase
        .from('quizzes')
        .insert(quizInserts)
        .select('id, quiz_code');

      if (qErr) {
        // ロールバック: game_set を削除
        await supabase.from('game_sets').delete().eq('id', gameSetId);
        return { success: false, error: `問題の投入失敗: ${qErr.message}` };
      }

      quizMap = new Map((quizzes ?? []).map((q) => [q.quiz_code, q.id]));
    }

    // 3. actions 作成
    const activeActions = data.actions.filter((a) => a.isActive);
    const actionInserts = activeActions.map((a) => ({
      game_set_id: gameSetId,
      action_code: a.actionCode,
      action_type: ACTION_TYPE_MAP[a.actionType] ?? a.actionType,
      value: a.value,
      message: a.message || null,
    }));

    let actionMap = new Map<string, string>(); // action_code → uuid
    if (actionInserts.length > 0) {
      const { data: actions, error: aErr } = await supabase
        .from('actions')
        .insert(actionInserts)
        .select('id, action_code');

      if (aErr) {
        await supabase.from('game_sets').delete().eq('id', gameSetId);
        return { success: false, error: `アクションの投入失敗: ${aErr.message}` };
      }

      actionMap = new Map((actions ?? []).map((a) => [a.action_code, a.id]));
    }

    // 4. cells 作成（quiz_id / action_id を解決）
    const activeCells = data.cells.filter((c) => c.isActive);
    const cellInserts = activeCells.map((c) => ({
      game_set_id: gameSetId,
      cell_number: c.cellNumber,
      cell_type: CELL_TYPE_MAP[c.cellType] ?? c.cellType,
      label: c.label || null,
      quiz_id: c.quizCode ? (quizMap.get(c.quizCode) ?? null) : null,
      correct_action_id: c.correctActionCode ? (actionMap.get(c.correctActionCode) ?? null) : null,
      wrong_action_id: c.wrongActionCode ? (actionMap.get(c.wrongActionCode) ?? null) : null,
      memo: c.memo || null,
    }));

    if (cellInserts.length > 0) {
      const { error: cErr } = await supabase.from('cells').insert(cellInserts);

      if (cErr) {
        await supabase.from('game_sets').delete().eq('id', gameSetId);
        return { success: false, error: `マスの投入失敗: ${cErr.message}` };
      }
    }

    return {
      success: true,
      gameSetId,
      counts: {
        quizzes: quizInserts.length,
        actions: actionInserts.length,
        cells: cellInserts.length,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: `予期しないエラー: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
