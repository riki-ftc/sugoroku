'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  type GameSession, type GameSet, type Team, type Cell, type Quiz, type Action,
  type TurnState, INITIAL_TURN_STATE,
  rollDice, calculateTargetPosition, applyAction, getNextTurnTeam,
  getCellByNumber, isGameFinished,
  generateBoardLayout, getCellColor, getCellEmoji,
} from '@/lib/game';

// === サイコロコンポーネント ===
function DiceDisplay({ value, rolling }: { value: number | null; rolling: boolean }) {
  const dotPositions: Record<number, number[][]> = {
    1: [[1, 1]],
    2: [[0, 2], [2, 0]],
    3: [[0, 2], [1, 1], [2, 0]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
  };

  const displayVal = rolling ? Math.floor(Math.random() * 6) + 1 : (value ?? 1);
  const dots = dotPositions[displayVal] ?? dotPositions[1];

  return (
    <div className={`relative mx-auto h-24 w-24 rounded-2xl bg-white shadow-lg border-2 border-gray-200 ${rolling ? 'animate-bounce' : ''}`}>
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-0 p-3">
        {Array.from({ length: 9 }, (_, idx) => {
          const row = Math.floor(idx / 3);
          const col = idx % 3;
          const hasDot = dots.some(([r, c]) => r === row && c === col);
          return (
            <div key={idx} className="flex items-center justify-center">
              {hasDot && (
                <div className="h-4 w-4 rounded-full bg-gray-800" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// === 盤面コンポーネント ===
function GameBoard({
  cells, teams, columns = 5,
}: {
  cells: Cell[];
  teams: Team[];
  columns?: number;
}) {
  const sorted = [...cells].sort((a, b) => a.cell_number - b.cell_number);
  const positions = generateBoardLayout(sorted.length, columns);
  const rows = Math.ceil(sorted.length / columns);

  return (
    <div className="overflow-x-auto">
      <div
        className="mx-auto grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(56px, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(56px, 1fr))`,
        }}
      >
        {positions.map((pos) => {
          const cell = sorted[pos.cellNumber];
          if (!cell) return null;
          const color = getCellColor(cell.cell_type);
          const emoji = getCellEmoji(cell.cell_type);
          const teamsOnCell = teams.filter((t) => t.current_position === cell.cell_number);

          return (
            <div
              key={cell.id}
              className="relative flex flex-col items-center justify-center rounded-lg border-2 p-1 text-center text-xs"
              style={{
                gridColumn: pos.x + 1,
                gridRow: pos.y + 1,
                borderColor: color,
                backgroundColor: color + '15',
              }}
            >
              <span className="text-base leading-none">{emoji}</span>
              <span className="mt-0.5 font-mono text-[10px] text-gray-500">
                {cell.cell_number}
              </span>
              {/* チームのコマ表示 */}
              {teamsOnCell.length > 0 && (
                <div className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
                  {teamsOnCell.map((t) => (
                    <span
                      key={t.id}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-xs shadow"
                      style={{ backgroundColor: t.team_color ?? '#888' }}
                      title={t.team_name}
                    >
                      {t.team_emoji ?? '●'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// === クイズモーダル ===
function QuizModal({
  quiz,
  timeLimit,
  onAnswer,
}: {
  quiz: Quiz;
  timeLimit: number;
  onAnswer: (choice: string) => void;
}) {
  const [remaining, setRemaining] = useState(timeLimit);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (timeLimit <= 0) return;
    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!selected) onAnswer('TIMEOUT');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLimit, selected, onAnswer]);

  const choices = [
    { key: 'A', text: quiz.choice_a },
    { key: 'B', text: quiz.choice_b },
    ...(quiz.choice_c ? [{ key: 'C', text: quiz.choice_c }] : []),
    ...(quiz.choice_d ? [{ key: 'D', text: quiz.choice_d }] : []),
  ];

  function handleSelect(key: string) {
    if (selected) return;
    setSelected(key);
    setTimeout(() => onAnswer(key), 400);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
        {/* タイマー */}
        {timeLimit > 0 && (
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">残り時間</span>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${
              remaining <= 5 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-blue-100 text-blue-700'
            }`}>
              {remaining}秒
            </span>
          </div>
        )}
        {/* カテゴリ & 難易度 */}
        <div className="mb-3 flex gap-2 text-xs">
          {quiz.category && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              {quiz.category}
            </span>
          )}
          {quiz.difficulty && (
            <span className={`rounded-full px-2 py-0.5 ${
              quiz.difficulty === '易' ? 'bg-green-100 text-green-700' :
              quiz.difficulty === '中' ? 'bg-yellow-100 text-yellow-700' :
              'bg-red-100 text-red-700'
            }`}>
              {quiz.difficulty}
            </span>
          )}
        </div>
        {/* 問題文 */}
        <h3 className="mb-6 text-lg font-bold leading-relaxed">{quiz.question}</h3>
        {/* 選択肢 */}
        <div className="space-y-3">
          {choices.map(({ key, text }) => (
            <button
              key={key}
              onClick={() => handleSelect(key)}
              disabled={!!selected}
              className={`w-full rounded-xl border-2 px-4 py-3 text-left font-medium transition-all ${
                selected === key
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-gray-700 dark:bg-gray-800'
              } ${selected && selected !== key ? 'opacity-50' : ''}`}
            >
              <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                {key}
              </span>
              {text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// === 結果表示モーダル ===
function ResultModal({
  isCorrect,
  explanation,
  action,
  onContinue,
}: {
  isCorrect: boolean | null;
  explanation: string | null;
  action: Action | null;
  onContinue: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl dark:bg-gray-900">
        {/* 正解/不正解 */}
        <div className="mb-4 text-6xl">
          {isCorrect === null ? '⏰' : isCorrect ? '🎉' : '😢'}
        </div>
        <h3 className={`mb-2 text-2xl font-bold ${
          isCorrect === null ? 'text-gray-700' :
          isCorrect ? 'text-green-600' : 'text-red-600'
        }`}>
          {isCorrect === null ? '時間切れ！' : isCorrect ? '正解！' : '不正解...'}
        </h3>
        {explanation && (
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">{explanation}</p>
        )}
        {/* アクション結果 */}
        {action && (
          <div className="mb-4 rounded-lg bg-indigo-50 p-3 dark:bg-indigo-950">
            <p className="font-medium text-indigo-700 dark:text-indigo-300">
              {action.message ?? `${action.action_type}${action.value ? ` ${action.value}マス` : ''}`}
            </p>
          </div>
        )}
        <button
          onClick={onContinue}
          className="mt-2 rounded-lg bg-indigo-600 px-8 py-3 font-bold text-white shadow-lg hover:bg-indigo-700"
        >
          次へ
        </button>
      </div>
    </div>
  );
}

// === メインプレイページ ===
export default function PlayPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const gameCode = params.code as string;
  const isHost = searchParams.get('host') === 'true';

  // ゲームデータ
  const [session, setSession] = useState<GameSession | null>(null);
  const [gameSet, setGameSet] = useState<GameSet | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  // ターン状態
  const [turnState, setTurnState] = useState<TurnState>(INITIAL_TURN_STATE);
  const [rolling, setRolling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 自チーム
  const [myTeamId, setMyTeamId] = useState<string | null>(null);

  const supabaseRef = useRef(createClient());

  // 自チームIDをsessionStorageから復元
  useEffect(() => {
    if (typeof window !== 'undefined' && !isHost) {
      const stored = sessionStorage.getItem(`sugoroku_team_${gameCode}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setMyTeamId(parsed.teamId);
        } catch {}
      }
    }
  }, [gameCode, isHost]);

  // 初期データ取得
  useEffect(() => {
    loadGameData();
  }, [gameCode]);

  // Realtime購読
  useEffect(() => {
    if (!session) return;
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel(`play:${gameCode}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'teams',
        filter: `game_session_id=eq.${session.id}`,
      }, () => { fetchTeams(session.id); })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'game_sessions',
        filter: `id=eq.${session.id}`,
      }, (payload) => {
        const updated = payload.new as GameSession;
        setSession(updated);
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'turn_events',
        filter: `game_session_id=eq.${session.id}`,
      }, (payload) => {
        handleTurnEvent(payload.new as any);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.id, gameCode]);

  async function loadGameData() {
    setLoading(true);
    const supabase = supabaseRef.current;

    // セッション取得
    const { data: sess, error: sessErr } = await supabase
      .from('game_sessions').select('*').eq('game_code', gameCode).single();
    if (sessErr || !sess) {
      setError('ゲームセッションが見つかりません');
      setLoading(false);
      return;
    }
    setSession(sess);

    // ゲームセット
    const { data: gs } = await supabase
      .from('game_sets').select('*').eq('id', sess.game_set_id).single();
    setGameSet(gs ?? null);

    // マスター3テーブル
    const [cellsRes, quizzesRes, actionsRes] = await Promise.all([
      supabase.from('cells').select('*').eq('game_set_id', sess.game_set_id).order('cell_number'),
      supabase.from('quizzes').select('*').eq('game_set_id', sess.game_set_id),
      supabase.from('actions').select('*').eq('game_set_id', sess.game_set_id),
    ]);
    setCells(cellsRes.data ?? []);
    setQuizzes(quizzesRes.data ?? []);
    setActions(actionsRes.data ?? []);

    // チーム
    await fetchTeams(sess.id);
    setLoading(false);
  }

  async function fetchTeams(sessionId: string) {
    const { data } = await supabaseRef.current
      .from('teams').select('*').eq('game_session_id', sessionId)
      .order('turn_order');
    setTeams(data ?? []);
  }

  // ターンイベント受信ハンドラ（Realtime経由）
  function handleTurnEvent(event: any) {
    const { event_type, payload } = event;
    switch (event_type) {
      case 'dice_roll':
        setTurnState((prev) => ({
          ...prev,
          phase: 'moving',
          diceValue: payload.dice_value,
          targetPosition: payload.target_position,
        }));
        // 移動アニメーション後にクイズフェーズへ
        setTimeout(() => {
          fetchTeams(session?.id ?? '');
          const cell = getCellByNumber(cells, payload.target_position);
          if (cell?.quiz_id) {
            const quiz = quizzes.find((q) => q.id === cell.quiz_id);
            setTurnState((prev) => ({
              ...prev,
              phase: 'quiz',
              currentCell: cell,
              currentQuiz: quiz ?? null,
            }));
          } else {
            // クイズなしマス → 次のターンへ
            setTurnState((prev) => ({
              ...prev,
              phase: 'next',
              currentCell: cell ?? null,
            }));
            setTimeout(() => advanceTurn(), 1500);
          }
        }, 1200);
        break;
      case 'answer':
        setTurnState((prev) => ({
          ...prev,
          phase: 'result',
          selectedAnswer: payload.selected,
          isCorrect: payload.is_correct,
        }));
        break;
      case 'action':
        fetchTeams(session?.id ?? '');
        break;
    }
  }

  // サイコロを振る（自分のターンの場合のみ）
  async function handleRoll() {
    if (!session || !currentTurnTeam || rolling) return;

    // スキップ券使用チェック
    if (currentTurnTeam.skip_tokens > 0 && currentTurnTeam.pause_turns > 0) {
      // 休みターンだがスキップ券がある場合の処理は後で実装
    }

    setRolling(true);

    // アニメーション用
    const animDuration = 800;
    setTimeout(async () => {
      const diceValue = rollDice(gameSet?.dice_sides ?? 6, gameSet?.dice_count ?? 1);
      const maxCell = Math.max(...cells.map((c) => c.cell_number));
      const targetPos = calculateTargetPosition(currentTurnTeam.current_position, diceValue, maxCell);

      setRolling(false);
      setTurnState((prev) => ({
        ...prev,
        phase: 'moving',
        diceValue,
        targetPosition: targetPos,
      }));

      // DBに反映
      const supabase = supabaseRef.current;

      // チーム位置更新
      await supabase
        .from('teams')
        .update({ current_position: targetPos })
        .eq('id', currentTurnTeam.id);

      // ターンイベント記録
      await supabase.from('turn_events').insert({
        game_session_id: session.id,
        team_id: currentTurnTeam.id,
        turn_number: session.turn_number,
        event_type: 'dice_roll',
        payload: {
          dice_value: diceValue,
          from_position: currentTurnTeam.current_position,
          target_position: targetPos,
        },
      });

      // 移動後の処理
      setTimeout(() => {
        fetchTeams(session.id);
        const cell = getCellByNumber(cells, targetPos);

        // ゴール判定
        if (targetPos >= maxCell) {
          handleGoal(currentTurnTeam);
          return;
        }

        if (cell?.quiz_id) {
          const quiz = quizzes.find((q) => q.id === cell.quiz_id);
          setTurnState((prev) => ({
            ...prev,
            phase: 'quiz',
            currentCell: cell,
            currentQuiz: quiz ?? null,
          }));
        } else {
          setTurnState((prev) => ({
            ...prev,
            phase: 'next',
            currentCell: cell ?? null,
          }));
          setTimeout(() => advanceTurn(), 1500);
        }
      }, 1200);
    }, animDuration);
  }

  // クイズ回答
  async function handleAnswer(choice: string) {
    if (!session || !currentTurnTeam || !turnState.currentQuiz || !turnState.currentCell) return;

    const isCorrect = choice === turnState.currentQuiz.answer;
    const isTimeout = choice === 'TIMEOUT';

    // 正解数更新
    if (isCorrect) {
      await supabaseRef.current
        .from('teams')
        .update({ correct_count: currentTurnTeam.correct_count + 1 })
        .eq('id', currentTurnTeam.id);
    }

    // アクション決定
    const actionId = isCorrect
      ? turnState.currentCell.correct_action_id
      : turnState.currentCell.wrong_action_id;
    const action = actionId ? actions.find((a) => a.id === actionId) ?? null : null;

    // ターンイベント記録
    await supabaseRef.current.from('turn_events').insert({
      game_session_id: session.id,
      team_id: currentTurnTeam.id,
      turn_number: session.turn_number,
      event_type: 'answer',
      payload: {
        quiz_id: turnState.currentQuiz.id,
        selected: choice,
        correct_answer: turnState.currentQuiz.answer,
        is_correct: isCorrect,
        is_timeout: isTimeout,
      },
    });

    setTurnState((prev) => ({
      ...prev,
      phase: 'result',
      selectedAnswer: choice,
      isCorrect: isTimeout ? null : isCorrect,
      actionToApply: action,
      actionMessage: action?.message ?? null,
    }));
  }

  // 結果確認後 → アクション適用 → ターン遷移
  async function handleResultContinue() {
    if (!session || !currentTurnTeam) return;

    const action = turnState.actionToApply;
    if (action) {
      const maxCell = Math.max(...cells.map((c) => c.cell_number));
      const updates = applyAction(currentTurnTeam, action, maxCell);

      await supabaseRef.current
        .from('teams')
        .update(updates)
        .eq('id', currentTurnTeam.id);

      await supabaseRef.current.from('turn_events').insert({
        game_session_id: session.id,
        team_id: currentTurnTeam.id,
        turn_number: session.turn_number,
        event_type: 'action',
        payload: {
          action_code: action.action_code,
          action_type: action.action_type,
          value: action.value,
          updates,
        },
      });

      // ゴール判定
      if (updates.is_finished) {
        await supabaseRef.current
          .from('teams')
          .update({ is_finished: true, finished_turn: session.turn_number })
          .eq('id', currentTurnTeam.id);
      }
    }

    await fetchTeams(session.id);
    setTimeout(() => advanceTurn(), 500);
  }

  // ゴール処理
  async function handleGoal(team: Team) {
    if (!session) return;
    await supabaseRef.current
      .from('teams')
      .update({
        is_finished: true,
        finished_turn: session.turn_number,
        current_position: Math.max(...cells.map((c) => c.cell_number)),
      })
      .eq('id', team.id);

    await fetchTeams(session.id);
    setTurnState((prev) => ({
      ...prev,
      phase: 'result',
      isCorrect: true,
      actionToApply: null,
      actionMessage: `${team.team_name} がゴールしました！🎉`,
    }));
  }

  // ターン遷移
  async function advanceTurn() {
    if (!session) return;

    const latestTeams = (await supabaseRef.current
      .from('teams').select('*').eq('game_session_id', session.id)
      .order('turn_order')).data ?? [];

    // ゲーム終了チェック
    if (isGameFinished(latestTeams)) {
      await supabaseRef.current
        .from('game_sessions')
        .update({ status: 'finished', finished_at: new Date().toISOString() })
        .eq('id', session.id);
      return;
    }

    const currentTeamId = session.current_turn_team_id ?? '';
    const nextTeam = getNextTurnTeam(latestTeams, currentTeamId);

    if (!nextTeam) {
      // 全員ゴール or 全員休み（レアケース）
      await supabaseRef.current
        .from('game_sessions')
        .update({ status: 'finished', finished_at: new Date().toISOString() })
        .eq('id', session.id);
      return;
    }

    // もう一度フラグをリセット
    if (nextTeam.id !== currentTeamId) {
      const currentTeam = latestTeams.find((t) => t.id === currentTeamId);
      if (currentTeam?.roll_again) {
        await supabaseRef.current
          .from('teams')
          .update({ roll_again: false })
          .eq('id', currentTeamId);
      }
    }

    // 休みターンのデクリメント
    for (const t of latestTeams) {
      if (t.pause_turns > 0 && t.id === nextTeam.id) {
        // このチームは休みなのでスキップ
        await supabaseRef.current
          .from('teams')
          .update({ pause_turns: t.pause_turns - 1 })
          .eq('id', t.id);
        // 次の次のチームへ
        const afterNext = getNextTurnTeam(latestTeams.map((tt) =>
          tt.id === t.id ? { ...tt, pause_turns: tt.pause_turns - 1 } : tt
        ), nextTeam.id);
        if (afterNext && afterNext.id !== nextTeam.id) {
          await supabaseRef.current
            .from('game_sessions')
            .update({
              current_turn_team_id: afterNext.id,
              turn_number: session.turn_number + 1,
            })
            .eq('id', session.id);
          setTurnState(INITIAL_TURN_STATE);
          return;
        }
      }
    }

    // セッション更新
    await supabaseRef.current
      .from('game_sessions')
      .update({
        current_turn_team_id: nextTeam.id,
        turn_number: session.turn_number + 1,
      })
      .eq('id', session.id);

    setTurnState(INITIAL_TURN_STATE);
  }

  // 現在のターンのチーム
  const currentTurnTeam = teams.find((t) => t.id === session?.current_turn_team_id);
  const isMyTurn = !isHost && myTeamId === session?.current_turn_team_id;
  const canRoll = (isHost || isMyTurn) && turnState.phase === 'roll' && !rolling;
  const canAnswer = isMyTurn && turnState.phase === 'quiz';

  // ゲーム終了画面
  if (session?.status === 'finished') {
    const rankedTeams = [...teams]
      .sort((a, b) => {
        if (a.is_finished && !b.is_finished) return -1;
        if (!a.is_finished && b.is_finished) return 1;
        if (a.finished_turn && b.finished_turn) return a.finished_turn - b.finished_turn;
        return b.current_position - a.current_position;
      });

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-amber-50 to-white p-6 dark:from-gray-950 dark:to-gray-900">
        <h1 className="mb-2 text-4xl font-bold">🏆 ゲーム終了！</h1>
        <p className="mb-8 text-gray-600 dark:text-gray-400">{gameSet?.name}</p>
        <div className="w-full max-w-md space-y-3">
          {rankedTeams.map((team, idx) => (
            <div
              key={team.id}
              className={`flex items-center gap-3 rounded-xl p-4 shadow ${
                idx === 0 ? 'border-2 border-amber-400 bg-amber-50 dark:bg-amber-950' :
                idx === 1 ? 'border border-gray-300 bg-gray-50 dark:bg-gray-900' :
                'border border-gray-200 bg-white dark:bg-gray-900'
              }`}
            >
              <span className="text-2xl font-bold text-gray-400">
                {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
              </span>
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
                style={{ backgroundColor: team.team_color ?? '#888' }}
              >
                {team.team_emoji ?? '●'}
              </span>
              <div className="flex-1">
                <p className="font-bold">{team.team_name}</p>
                <p className="text-xs text-gray-500">
                  正解数: {team.correct_count} ・ マス: {team.current_position}
                  {team.is_finished && ` ・ ${team.finished_turn}ターンでゴール`}
                </p>
              </div>
            </div>
          ))}
        </div>
        <a
          href="/"
          className="mt-8 rounded-lg bg-indigo-600 px-6 py-3 font-bold text-white hover:bg-indigo-700"
        >
          トップへ戻る
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">ゲームを読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white dark:from-gray-950 dark:to-gray-900">
      {/* ヘッダー */}
      <header className="border-b border-gray-200 bg-white/80 px-4 py-2 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <span className="text-sm font-medium">{gameSet?.name}</span>
            <span className="ml-2 text-xs text-gray-500">ターン {session?.turn_number ?? 0}</span>
          </div>
          <div className="flex items-center gap-2">
            {currentTurnTeam && (
              <span className="flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium"
                style={{ backgroundColor: (currentTurnTeam.team_color ?? '#888') + '30' }}>
                <span>{currentTurnTeam.team_emoji}</span>
                <span>{currentTurnTeam.team_name}のターン</span>
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-4">
        <div className="grid gap-4 lg:grid-cols-3">
          {/* 盤面（2/3幅） */}
          <div className="lg:col-span-2">
            <GameBoard cells={cells} teams={teams} columns={5} />
          </div>

          {/* サイドバー */}
          <div className="space-y-4">
            {/* サイコロ & アクション */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow dark:border-gray-800 dark:bg-gray-900">
              <DiceDisplay value={turnState.diceValue} rolling={rolling} />

              {turnState.phase === 'roll' && (
                <div className="mt-4 text-center">
                  {currentTurnTeam?.pause_turns ? (
                    <p className="text-amber-600 font-medium">
                      🚫 {currentTurnTeam.team_name}は1回休み（残り{currentTurnTeam.pause_turns}ターン）
                    </p>
                  ) : canRoll ? (
                    <button
                      onClick={handleRoll}
                      className="rounded-xl bg-indigo-600 px-8 py-4 text-lg font-bold text-white shadow-lg hover:bg-indigo-700 active:scale-95 transition-transform"
                    >
                      🎲 サイコロを振る！
                    </button>
                  ) : (
                    <p className="text-gray-500 text-sm">
                      {currentTurnTeam?.team_name}のターンです...
                    </p>
                  )}
                </div>
              )}

              {turnState.phase === 'moving' && turnState.diceValue && (
                <p className="mt-4 text-center text-xl font-bold text-indigo-600 animate-pulse">
                  {turnState.diceValue} が出た！ 移動中...
                </p>
              )}

              {turnState.phase === 'next' && (
                <p className="mt-4 text-center text-sm text-gray-500">
                  次のチームに交代中...
                </p>
              )}
            </div>

            {/* チーム順位表 */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow dark:border-gray-800 dark:bg-gray-900">
              <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">チーム状況</h3>
              <div className="space-y-2">
                {[...teams]
                  .sort((a, b) => b.current_position - a.current_position)
                  .map((team) => {
                    const maxCell = cells.length > 0 ? Math.max(...cells.map((c) => c.cell_number)) : 1;
                    const progress = Math.round((team.current_position / maxCell) * 100);
                    const isCurrent = team.id === session?.current_turn_team_id;
                    const isMe = team.id === myTeamId;

                    return (
                      <div
                        key={team.id}
                        className={`rounded-lg p-2 ${isCurrent ? 'ring-2 ring-indigo-500' : ''} ${isMe ? 'bg-indigo-50 dark:bg-indigo-950' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="flex h-7 w-7 items-center justify-center rounded-full text-sm"
                            style={{ backgroundColor: team.team_color ?? '#888' }}
                          >
                            {team.team_emoji}
                          </span>
                          <span className="flex-1 text-sm font-medium">
                            {team.team_name}
                            {isMe && <span className="ml-1 text-xs text-indigo-600">（あなた）</span>}
                            {team.is_finished && <span className="ml-1 text-xs">🏁</span>}
                          </span>
                          <span className="text-xs text-gray-500">
                            {team.current_position}/{maxCell}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${progress}%`,
                              backgroundColor: team.team_color ?? '#888',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* クイズモーダル */}
      {turnState.phase === 'quiz' && turnState.currentQuiz && (canAnswer || isHost) && (
        <QuizModal
          quiz={turnState.currentQuiz}
          timeLimit={gameSet?.answer_time_limit ?? 30}
          onAnswer={handleAnswer}
        />
      )}

      {/* 結果モーダル */}
      {turnState.phase === 'result' && (
        <ResultModal
          isCorrect={turnState.isCorrect}
          explanation={turnState.currentQuiz?.explanation ?? null}
          action={turnState.actionToApply}
          onContinue={(isHost || isMyTurn) ? handleResultContinue : () => {}}
        />
      )}
    </div>
  );
}
