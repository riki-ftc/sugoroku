// 前回安定版に、サイレントリロードによるターン同期を追加
'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  type GameSession, type GameSet, type Team, type Cell, type Quiz, type Action,
  type TurnState, INITIAL_TURN_STATE,
  rollDice, calculateTargetPosition, applyAction, getNextTurnTeam,
  getCellByNumber, isGameFinished,
  generateBoardLayout, getCellColor, getCellEmoji,
} from '@/lib/game';

function DiceDisplay({ value, rolling }: { value: number | null; rolling: boolean }) {
  const dotPositions: Record<number, number[][]> = {
    1: [[1, 1]], 2: [[0, 2], [2, 0]], 3: [[0, 2], [1, 1], [2, 0]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]], 5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
  };
  const displayVal = rolling ? Math.floor(Math.random() * 6) + 1 : (value ?? 1);
  const dots = dotPositions[displayVal] ?? dotPositions[1];
  return (
    <div className={`relative mx-auto h-24 w-24 rounded-2xl bg-white shadow-lg border-2 border-gray-200 ${rolling ? 'animate-bounce' : ''}`}>
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-0 p-3">
        {Array.from({ length: 9 }, (_, idx) => {
          const row = Math.floor(idx / 3); const col = idx % 3;
          const hasDot = dots.some(([r, c]) => r === row && c === col);
          return (<div key={idx} className="flex items-center justify-center">{hasDot && <div className="h-4 w-4 rounded-full bg-gray-800" />}</div>);
        })}
      </div>
    </div>
  );
}

function GameBoard({ cells, teams, columns = 5 }: { cells: Cell[]; teams: Team[]; columns?: number }) {
  const sorted = [...cells].sort((a, b) => a.cell_number - b.cell_number);
  const positions = generateBoardLayout(sorted.length, columns);
  const rows = Math.ceil(sorted.length / columns);
  return (
    <div className="overflow-x-auto">
      <div className="mx-auto grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(56px, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(56px, 1fr))` }}>
        {positions.map((pos) => {
          const cell = sorted[pos.cellNumber]; if (!cell) return null;
          const color = getCellColor(cell.cell_type); const emoji = getCellEmoji(cell.cell_type);
          const teamsOnCell = teams.filter((t) => t.current_position === cell.cell_number);
          return (
            <div key={cell.id} className="relative flex flex-col items-center justify-center rounded-lg border-2 p-1 text-center text-xs"
              style={{ gridColumn: pos.x + 1, gridRow: pos.y + 1, borderColor: color, backgroundColor: color + '15' }}>
              <span className="text-base leading-none">{emoji}</span>
              <span className="mt-0.5 font-mono text-[10px] text-gray-500">{cell.cell_number}</span>
              {teamsOnCell.length > 0 && (
                <div className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
                  {teamsOnCell.map((t) => (<span key={t.id} className="flex h-5 w-5 items-center justify-center rounded-full text-xs shadow" style={{ backgroundColor: t.team_color ?? '#888' }} title={t.team_name}>{t.team_emoji ?? '●'}</span>))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuizModal({ quiz, timeLimit, onAnswer, readOnly }: { quiz: Quiz; timeLimit: number; onAnswer: (choice: string) => void; readOnly: boolean }) {
  const [remaining, setRemaining] = useState(timeLimit);
  const [selected, setSelected] = useState<string | null>(null);
  const answeredRef = useRef(false);
  useEffect(() => { setRemaining(timeLimit); setSelected(null); answeredRef.current = false; }, [quiz.id, timeLimit]);
  useEffect(() => {
    if (timeLimit <= 0) return;
    const timer = setInterval(() => {
      setRemaining((prev) => { if (prev <= 1) { clearInterval(timer); if (!answeredRef.current && !readOnly) { answeredRef.current = true; onAnswer('TIMEOUT'); } return 0; } return prev - 1; });
    }, 1000);
    return () => clearInterval(timer);
  }, [quiz.id, timeLimit, onAnswer, readOnly]);
  const choices = [{ key: 'A', text: quiz.choice_a }, { key: 'B', text: quiz.choice_b }, ...(quiz.choice_c ? [{ key: 'C', text: quiz.choice_c }] : []), ...(quiz.choice_d ? [{ key: 'D', text: quiz.choice_d }] : [])];
  function handleSelect(key: string) { if (selected || answeredRef.current || readOnly) return; answeredRef.current = true; setSelected(key); setTimeout(() => onAnswer(key), 400); }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
        {timeLimit > 0 && (<div className="mb-4 flex items-center justify-between"><span className="text-sm text-gray-500">残り時間</span><span className={`rounded-full px-3 py-1 text-sm font-bold ${remaining <= 5 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-blue-100 text-blue-700'}`}>{remaining}秒</span></div>)}
        <div className="mb-3 flex gap-2 text-xs">
          {quiz.category && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-gray-800 dark:text-gray-400">{quiz.category}</span>}
          {quiz.difficulty && <span className={`rounded-full px-2 py-0.5 ${quiz.difficulty === '易' ? 'bg-green-100 text-green-700' : quiz.difficulty === '中' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{quiz.difficulty}</span>}
        </div>
        <h3 className="mb-6 text-lg font-bold leading-relaxed">{quiz.question}</h3>
        {readOnly && <p className="mb-4 text-sm text-gray-400 text-center animate-pulse">プレイヤーの回答を待っています...</p>}
        <div className="space-y-3">
          {choices.map(({ key, text }) => (<button key={key} onClick={() => handleSelect(key)} disabled={!!selected || readOnly}
            className={`w-full rounded-xl border-2 px-4 py-3 text-left font-medium transition-all ${selected === key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-gray-700 dark:bg-gray-800'} ${selected && selected !== key ? 'opacity-50' : ''} ${readOnly ? 'cursor-default' : ''}`}>
            <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-700 dark:bg-gray-700 dark:text-gray-300">{key}</span>{text}</button>))}
        </div>
      </div>
    </div>
  );
}

function ResultModal({ isCorrect, explanation, action, actionMessage, onContinue, canContinue, autoCloseSeconds }: {
  isCorrect: boolean | null; explanation: string | null; action: Action | null; actionMessage: string | null;
  onContinue: () => void; canContinue: boolean; autoCloseSeconds?: number;
}) {
  const [countdown, setCountdown] = useState(autoCloseSeconds ?? 0);
  const calledRef = useRef(false);
  useEffect(() => {
    if (!autoCloseSeconds || autoCloseSeconds <= 0) return;
    calledRef.current = false; setCountdown(autoCloseSeconds);
    const timer = setInterval(() => {
      setCountdown((prev) => { if (prev <= 1) { clearInterval(timer); if (!calledRef.current) { calledRef.current = true; onContinue(); } return 0; } return prev - 1; });
    }, 1000);
    return () => clearInterval(timer);
  }, [autoCloseSeconds, onContinue]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl dark:bg-gray-900">
        <div className="mb-4 text-6xl">{isCorrect === null ? '⏰' : isCorrect ? '🎉' : '😢'}</div>
        <h3 className={`mb-2 text-2xl font-bold ${isCorrect === null ? 'text-gray-700' : isCorrect ? 'text-green-600' : 'text-red-600'}`}>{isCorrect === null ? '時間切れ！' : isCorrect ? '正解！' : '不正解...'}</h3>
        {explanation && <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">{explanation}</p>}
        {(action || actionMessage) && (<div className="mb-4 rounded-lg bg-indigo-50 p-3 dark:bg-indigo-950"><p className="font-medium text-indigo-700 dark:text-indigo-300">{actionMessage ?? action?.message ?? `${action?.action_type}${action?.value ? ` ${action.value}マス` : ''}`}</p></div>)}
        {canContinue ? (
          <div>
            <button onClick={() => { calledRef.current = true; onContinue(); }} className="mt-2 rounded-lg bg-indigo-600 px-8 py-3 font-bold text-white shadow-lg hover:bg-indigo-700">次へ</button>
            {autoCloseSeconds && autoCloseSeconds > 0 && <p className="mt-2 text-xs text-gray-400">{countdown}秒後に自動で進みます</p>}
          </div>
        ) : autoCloseSeconds && autoCloseSeconds > 0 ? (
          <p className="mt-2 text-sm text-gray-400">{countdown}秒後に自動で閉じます...</p>
        ) : (
          <p className="mt-2 text-sm text-gray-400 animate-pulse">プレイヤーの操作を待っています...</p>
        )}
      </div>
    </div>
  );
}

function ConnectionBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <div className="fixed top-0 left-0 right-0 z-40 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white shadow">⚠️ 接続が不安定です。再接続を試みています...</div>;
}

function PlayContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const gameCode = params.code as string;
  const isHost = searchParams.get('host') === 'true';

  const [session, setSession] = useState<GameSession | null>(null);
  const [gameSet, setGameSet] = useState<GameSet | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [turnState, setTurnState] = useState<TurnState>(INITIAL_TURN_STATE);
  const [rolling, setRolling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myTeamId, setMyTeamId] = useState<string | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [isGoalResult, setIsGoalResult] = useState(false);

  const supabaseRef = useRef(createClient());
  const sessionRef = useRef<GameSession | null>(null);
  const teamsRef = useRef<Team[]>([]);
  const cellsRef = useRef<Cell[]>([]);
  const quizzesRef = useRef<Quiz[]>([]);
  const actionsRef = useRef<Action[]>([]);
  const isActingRef = useRef(false);
  const sessionIdRef = useRef<string>('');
  const lastKnownTurnRef = useRef<number>(0);

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { teamsRef.current = teams; }, [teams]);
  useEffect(() => { cellsRef.current = cells; }, [cells]);
  useEffect(() => { quizzesRef.current = quizzes; }, [quizzes]);
  useEffect(() => { actionsRef.current = actions; }, [actions]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !isHost) {
      const stored = sessionStorage.getItem(`team_${gameCode}`);
      if (stored) { try { setMyTeamId(JSON.parse(stored).teamId); } catch {} }
    }
  }, [gameCode, isHost]);

  // 初期データ取得
  useEffect(() => { loadGameData(); }, [gameCode]);

  // ★★★ サイレントリロード: 2秒ごとにturn_numberをチェック、変わっていたらリロード ★★★
  useEffect(() => {
    if (!sessionIdRef.current || loading) return;
    const interval = setInterval(async () => {
      if (isActingRef.current) return; // 自分が操作中はスキップ
      try {
        const { data } = await supabaseRef.current
          .from('game_sessions')
          .select('turn_number, status, current_turn_team_id')
          .eq('id', sessionIdRef.current)
          .single();
        if (!data) return;
        if (data.status === 'finished') {
          window.location.href = `/results/${gameCode}`;
          return;
        }
        // turn_numberまたはcurrent_turn_team_idが変わっていたらサイレントリロード
        if (data.turn_number !== lastKnownTurnRef.current || data.current_turn_team_id !== sessionRef.current?.current_turn_team_id) {
          window.location.reload();
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [loading, gameCode]);

  async function loadGameData() {
    setLoading(true);
    const supabase = supabaseRef.current;
    try {
      const { data: sess, error: sessErr } = await supabase.from('game_sessions').select('*').eq('game_code', gameCode).single();
      if (sessErr || !sess) { setError('ゲームセッションが見つかりません。コードを確認してください。'); setLoading(false); return; }
      if (sess.status === 'finished') { router.push(`/results/${gameCode}`); return; }
      setSession(sess); sessionRef.current = sess;
      sessionIdRef.current = sess.id;
      lastKnownTurnRef.current = sess.turn_number;
      const { data: gs } = await supabase.from('game_sets').select('*').eq('id', sess.game_set_id).single();
      setGameSet(gs ?? null);
      const [cellsRes, quizzesRes, actionsRes] = await Promise.all([
        supabase.from('cells').select('*').eq('game_set_id', sess.game_set_id).order('cell_number'),
        supabase.from('quizzes').select('*').eq('game_set_id', sess.game_set_id),
        supabase.from('actions').select('*').eq('game_set_id', sess.game_set_id),
      ]);
      setCells(cellsRes.data ?? []); setQuizzes(quizzesRes.data ?? []); setActions(actionsRes.data ?? []);
      cellsRef.current = cellsRes.data ?? []; quizzesRef.current = quizzesRes.data ?? []; actionsRef.current = actionsRes.data ?? [];
      await fetchTeams(sess.id);
    } catch { setError('データの読み込み中にエラーが発生しました。ページを再読み込みしてください。'); }
    setLoading(false);
  }

  async function fetchTeams(sessionId: string) {
    const { data } = await supabaseRef.current.from('teams').select('*').eq('game_session_id', sessionId).order('turn_order');
    const t = data ?? []; setTeams(t); teamsRef.current = t;
  }

  async function handleRoll() {
    if (isHost) return;
    const currentSession = sessionRef.current;
    const currentCells = cellsRef.current;
    const currentQuizzes = quizzesRef.current;
    const currentTeams = teamsRef.current;
    const currentTeam = currentTeams.find((t) => t.id === currentSession?.current_turn_team_id);
    if (!currentSession || !currentTeam || rolling) return;
    isActingRef.current = true;
    setRolling(true);
    setTimeout(async () => {
      const diceValue = rollDice(gameSet?.dice_sides ?? 6, gameSet?.dice_count ?? 1);
      const maxCell = Math.max(...currentCells.map((c) => c.cell_number));
      const targetPos = calculateTargetPosition(currentTeam.current_position, diceValue, maxCell);
      setRolling(false);
      setTurnState((prev) => ({ ...prev, phase: 'moving', diceValue, targetPosition: targetPos }));
      const supabase = supabaseRef.current;
      await supabase.from('teams').update({ current_position: targetPos }).eq('id', currentTeam.id);
      await supabase.from('turn_events').insert({ game_session_id: currentSession.id, team_id: currentTeam.id, turn_number: currentSession.turn_number, event_type: 'dice_roll', payload: { dice_value: diceValue, from_position: currentTeam.current_position, target_position: targetPos } });
      setTimeout(async () => {
        await fetchTeams(currentSession.id);
        if (targetPos >= maxCell) { await handleGoal(currentTeam, currentSession); return; }
        const cell = getCellByNumber(currentCells, targetPos);
        if (cell && cell.quiz_id) {
          const quiz = currentQuizzes.find((q) => q.id === cell.quiz_id);
          if (quiz) { setTurnState((prev) => ({ ...prev, phase: 'quiz', currentCell: cell, currentQuiz: quiz })); }
          else { setTurnState((prev) => ({ ...prev, phase: 'next', currentCell: cell })); isActingRef.current = false; setTimeout(() => advanceTurn(), 1500); }
        } else if (cell && (cell.cell_type === 'イベント' || cell.cell_type === 'ボーナス') && cell.correct_action_id) {
          const action = actionsRef.current.find((a) => a.id === cell.correct_action_id);
          if (action) { setTurnState((prev) => ({ ...prev, phase: 'result', currentCell: cell, isCorrect: true, actionToApply: action, actionMessage: action.message })); }
          else { setTurnState((prev) => ({ ...prev, phase: 'next', currentCell: cell })); isActingRef.current = false; setTimeout(() => advanceTurn(), 1500); }
        } else { setTurnState((prev) => ({ ...prev, phase: 'next', currentCell: cell ?? null })); isActingRef.current = false; setTimeout(() => advanceTurn(), 1500); }
      }, 1200);
    }, 800);
  }

  async function handleAnswer(choice: string) {
    if (isHost) return;
    const currentSession = sessionRef.current;
    const currentTeam = teamsRef.current.find((t) => t.id === currentSession?.current_turn_team_id);
    if (!currentSession || !currentTeam || !turnState.currentQuiz || !turnState.currentCell) return;
    const isCorrect = choice === turnState.currentQuiz.answer;
    const isTimeout = choice === 'TIMEOUT';
    if (isCorrect) { await supabaseRef.current.from('teams').update({ correct_count: currentTeam.correct_count + 1 }).eq('id', currentTeam.id); }
    const actionId = isCorrect ? turnState.currentCell.correct_action_id : turnState.currentCell.wrong_action_id;
    const action = actionId ? actionsRef.current.find((a) => a.id === actionId) ?? null : null;
    await supabaseRef.current.from('turn_events').insert({ game_session_id: currentSession.id, team_id: currentTeam.id, turn_number: currentSession.turn_number, event_type: 'answer', payload: { quiz_id: turnState.currentQuiz.id, selected: choice, correct_answer: turnState.currentQuiz.answer, is_correct: isCorrect, is_timeout: isTimeout } });
    setTurnState((prev) => ({ ...prev, phase: 'result', selectedAnswer: choice, isCorrect: isTimeout ? null : isCorrect, actionToApply: action, actionMessage: action?.message ?? null }));
  }

  function dismissRemoteResult() { setTurnState(INITIAL_TURN_STATE); setIsGoalResult(false); }

  async function handleResultContinue() {
    if (isHost) return;
    const currentSession = sessionRef.current;
    const currentTeam = teamsRef.current.find((t) => t.id === currentSession?.current_turn_team_id);
    if (!currentSession || !currentTeam) return;
    if (isGoalResult) {
      setIsGoalResult(false); isActingRef.current = false;
      await fetchTeams(currentSession.id);
      setTimeout(() => advanceTurn(), 500);
      return;
    }
    const action = turnState.actionToApply;
    if (action) {
      const maxCell = Math.max(...cellsRef.current.map((c) => c.cell_number));
      const updates = applyAction(currentTeam, action, maxCell);
      await supabaseRef.current.from('teams').update(updates).eq('id', currentTeam.id);
      await supabaseRef.current.from('turn_events').insert({ game_session_id: currentSession.id, team_id: currentTeam.id, turn_number: currentSession.turn_number, event_type: 'action', payload: { action_code: action.action_code, action_type: action.action_type, value: action.value, updates } });
      if (updates.is_finished) {
        await supabaseRef.current.from('teams').update({ is_finished: true, finished_turn: currentSession.turn_number }).eq('id', currentTeam.id);
        await fetchTeams(currentSession.id);
        setIsGoalResult(true);
        setTurnState((prev) => ({ ...prev, phase: 'result', isCorrect: true, actionToApply: null, currentQuiz: null, actionMessage: `${currentTeam.team_name} がゴールしました！🎉` }));
        isActingRef.current = false;
        return;
      }
    }
    await fetchTeams(currentSession.id);
    isActingRef.current = false;
    setTimeout(() => advanceTurn(), 500);
  }

  async function handleGoal(team: Team, currentSession?: GameSession) {
    const sess = currentSession ?? sessionRef.current;
    if (!sess) return;
    const maxCell = Math.max(...cellsRef.current.map((c) => c.cell_number));
    await supabaseRef.current.from('teams').update({ is_finished: true, finished_turn: sess.turn_number, current_position: maxCell }).eq('id', team.id);
    await fetchTeams(sess.id);
    setIsGoalResult(true);
    setTurnState((prev) => ({ ...prev, phase: 'result', isCorrect: true, actionToApply: null, actionMessage: `${team.team_name} がゴールしました！🎉` }));
  }

  async function advanceTurn() {
    if (isHost) return;
    const supabase = supabaseRef.current;
    const { data: latestSession } = await supabase.from('game_sessions').select('*').eq('game_code', gameCode).single();
    if (!latestSession) return;
    const { data: latestTeamsData } = await supabase.from('teams').select('*').eq('game_session_id', latestSession.id).order('turn_order');
    let latestTeams = latestTeamsData ?? [];
    if (isGameFinished(latestTeams)) {
      await supabase.from('game_sessions').update({ status: 'finished', finished_at: new Date().toISOString() }).eq('id', latestSession.id);
      setTimeout(() => router.push(`/results/${gameCode}`), 2000);
      return;
    }
    const currentTeamId = latestSession.current_turn_team_id ?? '';
    const { team: nextTeam, isSameTeam } = getNextTurnTeam(latestTeams, currentTeamId);
    if (!nextTeam) {
      await supabase.from('game_sessions').update({ status: 'finished', finished_at: new Date().toISOString() }).eq('id', latestSession.id);
      setTimeout(() => router.push(`/results/${gameCode}`), 2000);
      return;
    }
    if (isSameTeam) {
      await supabase.from('teams').update({ roll_again: false }).eq('id', nextTeam.id);
      setTurnState(INITIAL_TURN_STATE);
      return;
    }
    const currentTeam = latestTeams.find((t) => t.id === currentTeamId);
    if (currentTeam?.roll_again) { await supabase.from('teams').update({ roll_again: false }).eq('id', currentTeamId); }
    let targetTeam = nextTeam;
    const activeTeams = latestTeams.filter((t) => !t.is_finished).sort((a, b) => (a.turn_order ?? 0) - (b.turn_order ?? 0));
    let attempts = 0;
    while (targetTeam.pause_turns > 0 && attempts < activeTeams.length) {
      await supabase.from('teams').update({ pause_turns: targetTeam.pause_turns - 1 }).eq('id', targetTeam.id);
      latestTeams = latestTeams.map((t) => t.id === targetTeam.id ? { ...t, pause_turns: t.pause_turns - 1 } : t);
      const { team: afterNext } = getNextTurnTeam(latestTeams, targetTeam.id);
      if (!afterNext || afterNext.id === targetTeam.id) break;
      targetTeam = afterNext;
      attempts++;
    }
    const newTurnNumber = latestSession.turn_number + 1;
    await supabase.from('game_sessions').update({ current_turn_team_id: targetTeam.id, turn_number: newTurnNumber }).eq('id', latestSession.id);
    // ★ 操作者自身もリロードして最新状態にする
    lastKnownTurnRef.current = newTurnNumber;
    isActingRef.current = false;
    window.location.reload();
  }

  const currentTurnTeam = teams.find((t) => t.id === session?.current_turn_team_id);
  const isMyTurn = !isHost && myTeamId === session?.current_turn_team_id;
  const canRoll = isMyTurn && turnState.phase === 'roll' && !rolling;
  const canAnswer = isMyTurn && turnState.phase === 'quiz';
  const canContinue = isMyTurn;
  const resultAutoClose = isGoalResult ? 5 : (!canContinue ? 3 : undefined);
  const resultOnContinue = canContinue ? handleResultContinue : dismissRemoteResult;

  if (session?.status === 'finished') {
    return (<div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-amber-50 to-white p-6 dark:from-gray-950 dark:to-gray-900"><div className="text-6xl mb-4">🏆</div><h1 className="mb-2 text-3xl font-bold">ゲーム終了！</h1><p className="mb-6 text-gray-500 animate-pulse">結果ページに移動します...</p><a href={`/results/${gameCode}`} className="rounded-lg bg-indigo-600 px-6 py-3 font-bold text-white hover:bg-indigo-700">結果を見る →</a></div>);
  }
  if (loading) {
    return (<div className="flex min-h-screen items-center justify-center"><div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" /><p className="text-gray-500">ゲームを読み込み中...</p></div></div>);
  }
  if (error) {
    return (<div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6"><div className="text-4xl">😵</div><p className="text-red-600 font-medium">{error}</p><div className="flex gap-3"><button onClick={() => { setError(null); loadGameData(); }} className="rounded-lg bg-indigo-600 px-6 py-2 font-medium text-white hover:bg-indigo-700">再読み込み</button><a href="/" className="rounded-lg border border-gray-300 px-6 py-2 font-medium text-gray-700 hover:bg-gray-50">トップへ</a></div></div>);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white dark:from-gray-950 dark:to-gray-900">
      <ConnectionBanner visible={connectionLost} />
      <header className="border-b border-gray-200 bg-white/80 px-4 py-2 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <span className="text-sm font-medium">{gameSet?.name}</span>
            <span className="ml-2 text-xs text-gray-500">ターン {session?.turn_number ?? 0}</span>
            {isHost && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">👁 観戦モード</span>}
          </div>
          <div className="flex items-center gap-2">
            {currentTurnTeam && (<span className="flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium" style={{ backgroundColor: (currentTurnTeam.team_color ?? '#888') + '30' }}><span>{currentTurnTeam.team_emoji}</span><span>{currentTurnTeam.team_name}のターン</span></span>)}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2"><GameBoard cells={cells} teams={teams} columns={5} /></div>
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow dark:border-gray-800 dark:bg-gray-900">
              <DiceDisplay value={turnState.diceValue} rolling={rolling} />
              {turnState.phase === 'roll' && (<div className="mt-4 text-center">
                {canRoll ? (<button onClick={handleRoll} className="rounded-xl bg-indigo-600 px-8 py-4 text-lg font-bold text-white shadow-lg hover:bg-indigo-700 active:scale-95 transition-transform">🎲 サイコロを振る！</button>)
                : (<p className="text-gray-500 text-sm">{currentTurnTeam?.team_name}のターンです{isHost ? '（観戦中）' : '...'}</p>)}
              </div>)}
              {turnState.phase === 'moving' && turnState.diceValue && (<p className="mt-4 text-center text-xl font-bold text-indigo-600 animate-pulse">{turnState.diceValue} が出た！ 移動中...</p>)}
              {turnState.phase === 'next' && (<p className="mt-4 text-center text-sm text-gray-500">次のチームに交代中...</p>)}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow dark:border-gray-800 dark:bg-gray-900">
              <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">チーム状況</h3>
              <div className="space-y-2">
                {[...teams].sort((a, b) => b.current_position - a.current_position).map((team) => {
                  const maxCell = cells.length > 0 ? Math.max(...cells.map((c) => c.cell_number)) : 1;
                  const progress = Math.round((team.current_position / maxCell) * 100);
                  const isCurrent = team.id === session?.current_turn_team_id;
                  const isMe = team.id === myTeamId;
                  return (<div key={team.id} className={`rounded-lg p-2 ${isCurrent ? 'ring-2 ring-indigo-500' : ''} ${isMe ? 'bg-indigo-50 dark:bg-indigo-950' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm" style={{ backgroundColor: team.team_color ?? '#888' }}>{team.team_emoji}</span>
                      <span className="flex-1 text-sm font-medium">{team.team_name}{isMe && <span className="ml-1 text-xs text-indigo-600">（あなた）</span>}{team.is_finished && <span className="ml-1 text-xs">🏁</span>}</span>
                      <span className="text-xs text-gray-500">{team.current_position}/{maxCell}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: team.team_color ?? '#888' }} /></div>
                  </div>);
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
      {turnState.phase === 'quiz' && turnState.currentQuiz && (
        <QuizModal quiz={turnState.currentQuiz} timeLimit={gameSet?.answer_time_limit ?? 30} onAnswer={handleAnswer} readOnly={isHost || !canAnswer} />
      )}
      {turnState.phase === 'result' && (
        <ResultModal isCorrect={turnState.isCorrect} explanation={turnState.currentQuiz?.explanation ?? null} action={turnState.actionToApply} actionMessage={turnState.actionMessage} onContinue={resultOnContinue} canContinue={canContinue} autoCloseSeconds={resultAutoClose} />
      )}
    </div>
  );
}

export default function PlayPage() {
  return (<Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" /><p className="text-gray-500">ゲームを読み込み中...</p></div></div>}><PlayContent /></Suspense>);
}
