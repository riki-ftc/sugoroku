'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  type GameSession, type GameSet, type Team, type Cell, type Quiz, type Action,
  type TurnState, type StoredPlayerInfo, type PlayerAnswer, type Player, INITIAL_TURN_STATE,
  rollDice, calculateTargetPosition, applyAction, getNextTurnTeam,
  getCellByNumber, isGameFinished,
  generateBoardLayout, getCellColor, getCellEmoji,
} from '@/lib/game';

function getStoredPlayer(gameCode: string): StoredPlayerInfo | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(`player_${gameCode}`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function DiceDisplay({ value, rolling }: { value: number | null; rolling: boolean }) {
  const dotPositions: Record<number, number[][]> = { 1: [[1,1]], 2: [[0,2],[2,0]], 3: [[0,2],[1,1],[2,0]], 4: [[0,0],[0,2],[2,0],[2,2]], 5: [[0,0],[0,2],[1,1],[2,0],[2,2]], 6: [[0,0],[0,2],[1,0],[1,2],[2,0],[2,2]] };
  const displayVal = rolling ? Math.floor(Math.random() * 6) + 1 : (value ?? 1);
  const dots = dotPositions[displayVal] ?? dotPositions[1];
  return (<div className={`relative mx-auto h-24 w-24 rounded-2xl bg-white shadow-lg border-2 border-gray-200 ${rolling ? 'animate-bounce' : ''}`}><div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-0 p-3">{Array.from({ length: 9 }, (_, idx) => { const row = Math.floor(idx / 3); const col = idx % 3; const hasDot = dots.some(([r, c]) => r === row && c === col); return (<div key={idx} className="flex items-center justify-center">{hasDot && <div className="h-4 w-4 rounded-full bg-gray-800" />}</div>); })}</div></div>);
}

function GameBoard({ cells, teams, columns = 5, myTeamId }: { cells: Cell[]; teams: Team[]; columns?: number; myTeamId: string | null }) {
  const sorted = [...cells].sort((a, b) => a.cell_number - b.cell_number);
  const positions = generateBoardLayout(sorted.length, columns);
  const rows = Math.ceil(sorted.length / columns);
  const showFull = teams.length <= 12;
  return (<div className="overflow-x-auto"><div className="mx-auto grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(56px, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(56px, 1fr))` }}>{positions.map((pos) => { const cell = sorted[pos.cellNumber]; if (!cell) return null; const color = getCellColor(cell.cell_type); const emoji = getCellEmoji(cell.cell_type); let teamsOnCell = teams.filter((t) => t.current_position === cell.cell_number); if (!showFull && teamsOnCell.length > 4) { const my = teamsOnCell.find((t) => t.id === myTeamId); const others = teamsOnCell.filter((t) => t.id !== myTeamId).slice(0, 3); teamsOnCell = my ? [my, ...others] : others; } return (<div key={cell.id} className="relative flex flex-col items-center justify-center rounded-lg border-2 p-1 text-center text-xs" style={{ gridColumn: pos.x + 1, gridRow: pos.y + 1, borderColor: color, backgroundColor: color + '15' }}><span className="text-base leading-none">{emoji}</span><span className="mt-0.5 font-mono text-[10px] text-gray-500">{cell.cell_number}</span>{teamsOnCell.length > 0 && (<div className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">{teamsOnCell.map((t) => (<span key={t.id} className={`flex h-5 w-5 items-center justify-center rounded-full text-xs shadow ${t.id === myTeamId ? 'ring-2 ring-indigo-500' : ''}`} style={{ backgroundColor: t.team_color ?? '#888' }} title={t.team_name}>{t.team_emoji ?? t.team_name.charAt(0)}</span>))}{!showFull && teams.filter((t) => t.current_position === cell.cell_number).length > teamsOnCell.length && (<span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-400 text-[8px] text-white">+{teams.filter((t) => t.current_position === cell.cell_number).length - teamsOnCell.length}</span>)}</div>)}</div>); })}</div></div>);
}

function QuizModal({ quiz, timeLimit, onAnswer, readOnly, answerRule, teamAnswers, teamMemberCount, myAnswerSubmitted }: {
  quiz: Quiz; timeLimit: number; onAnswer: (choice: string) => void; readOnly: boolean;
  answerRule: string; teamAnswers: PlayerAnswer[]; teamMemberCount: number; myAnswerSubmitted: boolean;
}) {
  const [remaining, setRemaining] = useState(timeLimit);
  const [selected, setSelected] = useState<string | null>(null);
  const answeredRef = useRef(false);

  useEffect(() => { setRemaining(timeLimit); setSelected(null); answeredRef.current = false; }, [quiz.id, timeLimit]);
  useEffect(() => {
    if (timeLimit <= 0) return;
    const timer = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (!answeredRef.current && !readOnly) { answeredRef.current = true; onAnswer('TIMEOUT'); }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [quiz.id, timeLimit, onAnswer, readOnly]);

  const choices = [
    { key: 'A', text: quiz.choice_a },
    { key: 'B', text: quiz.choice_b },
    ...(quiz.choice_c ? [{ key: 'C', text: quiz.choice_c }] : []),
    ...(quiz.choice_d ? [{ key: 'D', text: quiz.choice_d }] : []),
  ];

  const isUnanimous = answerRule === 'unanimous';
  const showWaiting = isUnanimous && myAnswerSubmitted && teamAnswers.length < teamMemberCount;

  function handleSelect(key: string) {
    if (selected || answeredRef.current || readOnly) return;
    answeredRef.current = true;
    setSelected(key);
    setTimeout(() => onAnswer(key), 400);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900">
        {timeLimit > 0 && (
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">残り時間</span>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${remaining <= 5 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-blue-100 text-blue-700'}`}>
              {remaining}秒
            </span>
          </div>
        )}
        <div className="mb-3 flex gap-2 text-xs">
          {quiz.category && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600 dark:bg-gray-800 dark:text-gray-400">{quiz.category}</span>}
          {quiz.difficulty && <span className={`rounded-full px-2 py-0.5 ${quiz.difficulty === '易' ? 'bg-green-100 text-green-700' : quiz.difficulty === '中' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{quiz.difficulty}</span>}
        </div>
        <h3 className="mb-6 text-lg font-bold leading-relaxed">{quiz.question}</h3>

        {/* 全員一致モードで回答済み → 待機表示 */}
        {showWaiting ? (
          <div className="text-center py-4">
            <div className="mb-3 text-4xl animate-bounce">🤔</div>
            <p className="text-lg font-bold text-indigo-700 mb-2">回答済み！</p>
            <p className="text-sm text-gray-500 mb-4">チームメンバーの回答を待っています...</p>
            <div className="flex items-center justify-center gap-2">
              <div className="h-2 flex-1 max-w-48 rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                  style={{ width: `${(teamAnswers.length / teamMemberCount) * 100}%` }}
                />
              </div>
              <span className="text-sm font-medium text-indigo-600">
                {teamAnswers.length}/{teamMemberCount}人
              </span>
            </div>
          </div>
        ) : (
          <>
            {readOnly && <p className="mb-4 text-sm text-gray-400 text-center animate-pulse">回答を待っています...</p>}
            <div className="space-y-3">
              {choices.map(({ key, text }) => (
                <button
                  key={key}
                  onClick={() => handleSelect(key)}
                  disabled={!!selected || readOnly || myAnswerSubmitted}
                  className={`w-full rounded-xl border-2 px-4 py-3 text-left font-medium transition-all
                    ${selected === key ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-gray-700 dark:bg-gray-800'}
                    ${selected && selected !== key ? 'opacity-50' : ''}
                    ${readOnly || myAnswerSubmitted ? 'cursor-default' : ''}`}
                >
                  <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-700 dark:bg-gray-700 dark:text-gray-300">{key}</span>
                  {text}
                </button>
              ))}
            </div>
          </>
        )}

        {/* 全員一致モードの回答状況バー（回答前にも表示） */}
        {isUnanimous && !showWaiting && teamMemberCount > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
            <span>チーム回答状況: {teamAnswers.length}/{teamMemberCount}人</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultModal({ isCorrect, explanation, action, actionMessage, onContinue, canContinue, autoCloseSeconds, resultType, unanimousInfo }: {
  isCorrect: boolean | null; explanation: string | null; action: Action | null; actionMessage: string | null;
  onContinue: () => void; canContinue: boolean; autoCloseSeconds?: number; resultType?: 'quiz' | 'event' | 'goal';
  unanimousInfo?: { matched: boolean; answers: PlayerAnswer[] } | null;
}) {
  const [countdown, setCountdown] = useState(autoCloseSeconds ?? 0);
  const calledRef = useRef(false);

  useEffect(() => {
    if (!autoCloseSeconds || autoCloseSeconds <= 0) return;
    calledRef.current = false; setCountdown(autoCloseSeconds);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timer); if (!calledRef.current) { calledRef.current = true; onContinue(); } return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [autoCloseSeconds, onContinue]);

  const emoji = resultType === 'goal' ? '🏁' : resultType === 'event' ? '⭐' : isCorrect === null ? '⏰' : isCorrect ? '🎉' : '😢';
  const title = resultType === 'goal' ? 'ゴール！' : resultType === 'event' ? 'イベント！' : isCorrect === null ? '時間切れ！' : isCorrect ? '正解！' : '不正解...';
  const titleColor = resultType === 'goal' ? 'text-amber-600' : resultType === 'event' ? 'text-indigo-600' : isCorrect === null ? 'text-gray-700' : isCorrect ? 'text-green-600' : 'text-red-600';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl dark:bg-gray-900">
        <div className="mb-4 text-6xl">{emoji}</div>
        <h3 className={`mb-2 text-2xl font-bold ${titleColor}`}>{title}</h3>

        {/* 全員一致モードの不一致表示 */}
        {unanimousInfo && !unanimousInfo.matched && (
          <p className="mb-2 text-sm text-orange-600 font-medium">💬 意見が分かれました！</p>
        )}

        {explanation && <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">{explanation}</p>}
        {(action || actionMessage) && (
          <div className="mb-4 rounded-lg bg-indigo-50 p-3 dark:bg-indigo-950">
            <p className="font-medium text-indigo-700 dark:text-indigo-300">
              {actionMessage ?? action?.message ?? `${action?.action_type}${action?.value ? ` ${action.value}マス` : ''}`}
            </p>
          </div>
        )}
        {canContinue ? (
          <div>
            <button onClick={() => { calledRef.current = true; onContinue(); }} className="mt-2 rounded-lg bg-indigo-600 px-8 py-3 font-bold text-white shadow-lg hover:bg-indigo-700">次へ</button>
            {autoCloseSeconds && autoCloseSeconds > 0 && <p className="mt-2 text-xs text-gray-400">{countdown}秒後に自動で進みます</p>}
          </div>
        ) : autoCloseSeconds && autoCloseSeconds > 0 ? (
          <p className="mt-2 text-sm text-gray-400">{countdown}秒後に自動で閉じます...</p>
        ) : (
          <p className="mt-2 text-sm text-gray-400 animate-pulse">操作を待っています...</p>
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
  const params = useParams(); const searchParams = useSearchParams(); const router = useRouter();
  const gameCode = params.code as string; const isHost = searchParams.get('host') === 'true';

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
  const [resultType, setResultType] = useState<'quiz' | 'event' | 'goal'>('quiz');
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  // チーム回答用
  const [teamMembers, setTeamMembers] = useState<Player[]>([]);
  const [unanimousResult, setUnanimousResult] = useState<{ matched: boolean; answers: PlayerAnswer[] } | null>(null);

  const supabaseRef = useRef(createClient());
  const sessionRef = useRef<GameSession | null>(null);
  const teamsRef = useRef<Team[]>([]);
  const cellsRef = useRef<Cell[]>([]);
  const quizzesRef = useRef<Quiz[]>([]);
  const actionsRef = useRef<Action[]>([]);
  const isActingRef = useRef(false);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const answerChannelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null);
  const sessionIdRef = useRef('');

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { teamsRef.current = teams; }, [teams]);
  useEffect(() => { cellsRef.current = cells; }, [cells]);
  useEffect(() => { quizzesRef.current = quizzes; }, [quizzes]);
  useEffect(() => { actionsRef.current = actions; }, [actions]);
  useEffect(() => {
    if (typeof window !== 'undefined' && !isHost) {
      const stored = getStoredPlayer(gameCode);
      if (stored?.teamId) setMyTeamId(stored.teamId);
    }
  }, [gameCode, isHost]);

  const isSimultaneous = session?.progress_mode === 'simultaneous';
  function isSimultaneousCheck(s: GameSession | null) { return s?.progress_mode === 'simultaneous'; }
  function isTeamPlay(s: GameSession | null) { return s?.play_mode === 'team'; }
  function getAnswerRule(s: GameSession | null) { return s?.answer_rule ?? 'anyone'; }

  // チーム内メンバーの取得
  async function fetchTeamMembers(sessionId: string, teamId: string) {
    const { data } = await supabaseRef.current
      .from('players')
      .select('*')
      .eq('game_session_id', sessionId)
      .eq('team_id', teamId)
      .eq('is_spectator', false);
    const members = data ?? [];
    setTeamMembers(members);
    return members;
  }

  // 現在のターン番号を取得（同時プレイ対応）
  async function getCurrentTurnNumber(sessionId: string, teamId: string): Promise<number> {
    const s = sessionRef.current;
    if (isSimultaneousCheck(s)) {
      const { count } = await supabaseRef.current
        .from('turn_events')
        .select('id', { count: 'exact', head: true })
        .eq('game_session_id', sessionId)
        .eq('team_id', teamId)
        .eq('event_type', 'dice_roll');
      return count ?? 0;
    }
    return s?.turn_number ?? 0;
  }

  // ===== player_answers Realtime購読 =====
  function subscribeToPlayerAnswers(sessionId: string, teamId: string) {
    const supabase = supabaseRef.current;
    // 既存チャネルを削除
    if (answerChannelRef.current) {
      supabase.removeChannel(answerChannelRef.current);
      answerChannelRef.current = null;
    }

    const ch = supabase.channel(`answers:${teamId}:${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'player_answers',
          filter: `team_id=eq.${teamId}`,
        },
        (payload) => {
          const newAnswer = payload.new as PlayerAnswer;
          setTurnState(prev => {
            // 同じターンの回答のみ集める
            const existing = prev.teamAnswers.filter(a => a.id !== newAnswer.id);
            const updated = [...existing, newAnswer];
            return { ...prev, teamAnswers: updated };
          });
        }
      )
      .subscribe();
    answerChannelRef.current = ch;
  }

  // ===== 全員回答が揃ったかチェック（unanimousモード） =====
  useEffect(() => {
    const s = sessionRef.current;
    if (!s || getAnswerRule(s) !== 'unanimous' || !isTeamPlay(s)) return;
    if (turnState.phase !== 'quiz' || !turnState.currentQuiz) return;

    const onlineMembers = teamMembers.filter(m => m.is_online);
    const memberCount = onlineMembers.length;
    if (memberCount === 0) return;

    // 現在のクイズに対する回答のみフィルタ
    const relevantAnswers = turnState.teamAnswers.filter(
      a => a.quiz_id === turnState.currentQuiz?.id
    );

    if (relevantAnswers.length >= memberCount) {
      // 全員揃った → 一致判定
      const nonTimeoutAnswers = relevantAnswers.filter(a => a.selected_answer !== null);
      const uniqueAnswers = new Set(nonTimeoutAnswers.map(a => a.selected_answer));
      const allTimedOut = nonTimeoutAnswers.length === 0;
      const matched = !allTimedOut && uniqueAnswers.size === 1;

      // 一致した場合: その選択肢で正誤判定
      // 不一致の場合: 不正解扱い
      const teamChoice = matched ? nonTimeoutAnswers[0].selected_answer! : null;
      const ok = matched ? teamChoice === turnState.currentQuiz!.answer : false;
      const isTimeout = allTimedOut;

      setUnanimousResult({ matched, answers: relevantAnswers });

      // turn_events に answer を書き込み（チーム代表として）
      finalizeTeamAnswer(
        teamChoice,
        ok,
        isTimeout,
        matched,
      );
    }
  }, [turnState.teamAnswers, turnState.phase, turnState.currentQuiz, teamMembers]);

  // チーム回答を確定してturn_eventsに書き込む
  async function finalizeTeamAnswer(
    teamChoice: string | null,
    isCorrect: boolean,
    isTimeout: boolean,
    matched: boolean,
  ) {
    const cs = sessionRef.current;
    const tid = isSimultaneousCheck(cs) ? myTeamId : cs?.current_turn_team_id;
    const team = teamsRef.current.find(t => t.id === tid);
    if (!cs || !team || !turnState.currentQuiz || !turnState.currentCell) return;

    if (isCorrect) {
      await supabaseRef.current.from('teams')
        .update({ correct_count: team.correct_count + 1 })
        .eq('id', team.id);
    }

    const aid = isCorrect ? turnState.currentCell.correct_action_id : turnState.currentCell.wrong_action_id;
    const act = aid ? actionsRef.current.find(a => a.id === aid) ?? null : null;

    const tn = await getCurrentTurnNumber(cs.id, team.id);
    await supabaseRef.current.from('turn_events').insert({
      game_session_id: cs.id,
      team_id: team.id,
      turn_number: tn,
      event_type: 'answer',
      payload: {
        quiz_id: turnState.currentQuiz.id,
        selected: teamChoice,
        correct_answer: turnState.currentQuiz.answer,
        is_correct: isCorrect,
        is_timeout: isTimeout,
        unanimous_matched: matched,
      },
    });

    const actionMsg = !matched && !isTimeout
      ? '💬 意見が分かれたため不正解です'
      : act?.message ?? null;

    setResultType('quiz');
    setTurnState(p => ({
      ...p,
      phase: 'result',
      selectedAnswer: teamChoice,
      isCorrect: isTimeout ? null : isCorrect,
      actionToApply: act,
      actionMessage: actionMsg,
    }));
  }

  useEffect(() => {
    let cancelled = false;
    initGame(cancelled);
    return () => {
      cancelled = true;
      if (channelRef.current) { supabaseRef.current.removeChannel(channelRef.current); channelRef.current = null; }
      if (answerChannelRef.current) { supabaseRef.current.removeChannel(answerChannelRef.current); answerChannelRef.current = null; }
    };
  }, [gameCode]);

  async function initGame(cancelled: boolean) {
    setLoading(true);
    const supabase = supabaseRef.current;

    const { data: sess, error: sessErr } = await supabase
      .from('game_sessions').select('*').eq('game_code', gameCode).single();
    if (sessErr || !sess) { setError('ゲームセッションが見つかりません。コードを確認してください。'); setLoading(false); return; }
    if (sess.status === 'finished') { router.push(`/results/${gameCode}`); return; }
    if (sess.status === 'waiting' || sess.status === 'team_forming') { router.push(`/lobby/${gameCode}`); return; }
    if (cancelled) return;
    sessionIdRef.current = sess.id;

    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const sessionId = sess.id;
    const channel = supabase.channel(`play:${gameCode}:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `game_session_id=eq.${sessionId}` }, () => fetchTeams(sessionId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${sessionId}` }, (payload) => {
        const updated = payload.new as GameSession;
        const prev = sessionRef.current;
        setSession(updated); sessionRef.current = updated;
        if (updated.status === 'finished') { setTimeout(() => router.push(`/results/${gameCode}`), 2000); return; }
        if (updated.status === 'waiting' || updated.status === 'team_forming') { window.location.href = `/lobby/${gameCode}`; return; }
        if (!isSimultaneousCheck(updated) && prev && updated.current_turn_team_id !== prev.current_turn_team_id) {
          setTurnState(INITIAL_TURN_STATE); setIsGoalResult(false); setUnanimousResult(null); isActingRef.current = false;
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'turn_events', filter: `game_session_id=eq.${sessionId}` }, (payload) => {
        const ev = payload.new as any;
        const stored = getStoredPlayer(gameCode);
        if (isSimultaneousCheck(sessionRef.current)) {
          if (ev.team_id === stored?.teamId) return;
          fetchTeams(sessionIdRef.current);
        } else {
          if (isActingRef.current) return;
          handleRemoteTurnEvent(ev);
        }
      })
      .on('system', {}, (p: any) => { if (p?.extension === 'system' && p?.message === 'disconnected') setConnectionLost(true); })
      .subscribe(async (status) => { if (status === 'SUBSCRIBED') { setConnectionLost(false); await loadAllGameData(sess); } });
    channelRef.current = channel;
  }

  async function loadAllGameData(sess: GameSession) {
    const supabase = supabaseRef.current;
    setSession(sess); sessionRef.current = sess;

    const { data: gs } = await supabase.from('game_sets').select('*').eq('id', sess.game_set_id).single();
    setGameSet(gs ?? null);

    const [cR, qR, aR] = await Promise.all([
      supabase.from('cells').select('*').eq('game_set_id', sess.game_set_id).order('cell_number'),
      supabase.from('quizzes').select('*').eq('game_set_id', sess.game_set_id),
      supabase.from('actions').select('*').eq('game_set_id', sess.game_set_id),
    ]);
    setCells(cR.data ?? []); setQuizzes(qR.data ?? []); setActions(aR.data ?? []);
    cellsRef.current = cR.data ?? []; quizzesRef.current = qR.data ?? []; actionsRef.current = aR.data ?? [];

    const { data: latest } = await supabase.from('game_sessions').select('*').eq('id', sess.id).single();
    if (latest) { setSession(latest); sessionRef.current = latest; }

    await fetchTeams(sess.id);

    const stored = getStoredPlayer(gameCode);
    if (stored?.teamId) {
      setMyTeamId(stored.teamId);
      // チーム戦ならメンバーリスト取得＆player_answers購読
      if (isTeamPlay(sess) && getAnswerRule(sess) === 'unanimous') {
        await fetchTeamMembers(sess.id, stored.teamId);
        subscribeToPlayerAnswers(sess.id, stored.teamId);
      }
    }

    setLoading(false);
  }

  async function handleRemoteTurnEvent(event: { event_type: string; payload: any; team_id: string }) {
    const { event_type, payload, team_id } = event;
    const cc = cellsRef.current; const cq = quizzesRef.current;

    switch (event_type) {
      case 'dice_roll': {
        setTurnState(p => ({ ...p, phase: 'moving', diceValue: payload.dice_value, targetPosition: payload.target_position }));
        setTimeout(() => {
          fetchTeams(sessionIdRef.current);
          const mx = Math.max(...cc.map(c => c.cell_number));
          if (payload.target_position >= mx) {
            const tm = teamsRef.current.find(t => t.id === team_id);
            setIsGoalResult(true); setResultType('goal');
            setTurnState(p => ({ ...p, phase: 'result', isCorrect: true, actionToApply: null, actionMessage: `${tm?.team_name ?? 'チーム'} がゴールしました！🎉` }));
            return;
          }
          const cell = getCellByNumber(cc, payload.target_position);
          if (cell?.quiz_id) {
            const quiz = cq.find(q => q.id === cell.quiz_id);
            if (quiz) {
              // ターン制チーム戦のリモートイベント: anyoneならreadOnly表示不要、unanimousなら自分も回答
              const s = sessionRef.current;
              if (isTeamPlay(s) && getAnswerRule(s) === 'unanimous') {
                // 全員一致モード: クイズ表示して自分も回答する
                setTurnState(p => ({ ...p, phase: 'quiz', currentCell: cell, currentQuiz: quiz, teamAnswers: [], myAnswerSubmitted: false }));
              } else {
                setTurnState(p => ({ ...p, phase: 'quiz', currentCell: cell, currentQuiz: quiz }));
              }
            } else setTurnState(p => ({ ...p, phase: 'next', currentCell: cell }));
          } else if (cell && (cell.cell_type === 'イベント' || cell.cell_type === 'ボーナス') && cell.correct_action_id) {
            const act = actionsRef.current.find(a => a.id === cell.correct_action_id);
            if (act) { setResultType('event'); setTurnState(p => ({ ...p, phase: 'result', currentCell: cell, isCorrect: true, actionToApply: act, actionMessage: act.message })); }
            else setTurnState(p => ({ ...p, phase: 'next', currentCell: cell }));
          } else setTurnState(p => ({ ...p, phase: 'next', currentCell: cell ?? null }));
        }, 1200);
        break;
      }
      case 'answer': {
        const aid = payload.is_correct ? turnState.currentCell?.correct_action_id : turnState.currentCell?.wrong_action_id;
        const act = aid ? actionsRef.current.find(a => a.id === aid) ?? null : null;
        const actionMsg = payload.unanimous_matched === false
          ? '💬 意見が分かれたため不正解です'
          : act?.message ?? null;
        setResultType('quiz');
        setUnanimousResult(payload.unanimous_matched !== undefined ? { matched: payload.unanimous_matched, answers: [] } : null);
        setTurnState(p => ({ ...p, phase: 'result', selectedAnswer: payload.selected, isCorrect: payload.is_timeout ? null : payload.is_correct, actionToApply: act, actionMessage: actionMsg }));
        break;
      }
      case 'action': {
        await fetchTeams(sessionIdRef.current);
        const ut = teamsRef.current.find(t => t.id === team_id);
        if (ut?.is_finished) {
          setIsGoalResult(true); setResultType('goal');
          setTurnState(p => ({ ...p, phase: 'result', isCorrect: true, actionToApply: null, currentQuiz: null, actionMessage: `${ut.team_name} がゴールしました！🎉` }));
        }
        break;
      }
    }
  }

  async function fetchTeams(sid: string) {
    const { data } = await supabaseRef.current.from('teams').select('*').eq('game_session_id', sid).order('turn_order');
    const t = data ?? []; setTeams(t); teamsRef.current = t;
  }

  async function handleRoll() {
    if (isHost) return;
    const cs = sessionRef.current; const cc = cellsRef.current; const cq = quizzesRef.current; const ct = teamsRef.current;
    const tid = isSimultaneous ? myTeamId : cs?.current_turn_team_id;
    const team = ct.find(t => t.id === tid);
    if (!cs || !team || rolling) return;
    isActingRef.current = true; setRolling(true);

    setTimeout(async () => {
      const dv = rollDice(gameSet?.dice_sides ?? 6, gameSet?.dice_count ?? 1);
      const mx = Math.max(...cc.map(c => c.cell_number));
      const tp = calculateTargetPosition(team.current_position, dv, mx);
      setRolling(false);
      setTurnState(p => ({ ...p, phase: 'moving', diceValue: dv, targetPosition: tp }));

      const sb = supabaseRef.current;
      await sb.from('teams').update({ current_position: tp }).eq('id', team.id);

      const tn = await getCurrentTurnNumber(cs.id, team.id);
      await sb.from('turn_events').insert({
        game_session_id: cs.id, team_id: team.id, turn_number: tn + 1,
        event_type: 'dice_roll',
        payload: { dice_value: dv, from_position: team.current_position, target_position: tp },
      });

      setTimeout(async () => {
        await fetchTeams(cs.id);
        if (tp >= mx) { await handleGoal(team, cs); return; }
        const cell = getCellByNumber(cc, tp);
        if (cell?.quiz_id) {
          const quiz = cq.find(q => q.id === cell.quiz_id);
          if (quiz) {
            // チーム戦かつunanimousなら回答状態をリセット
            if (isTeamPlay(cs) && getAnswerRule(cs) === 'unanimous') {
              setTurnState(p => ({ ...p, phase: 'quiz', currentCell: cell, currentQuiz: quiz, teamAnswers: [], myAnswerSubmitted: false }));
            } else {
              setTurnState(p => ({ ...p, phase: 'quiz', currentCell: cell, currentQuiz: quiz }));
            }
          } else afterTurnComplete();
        } else if (cell && (cell.cell_type === 'イベント' || cell.cell_type === 'ボーナス') && cell.correct_action_id) {
          const act = actionsRef.current.find(a => a.id === cell.correct_action_id);
          if (act) { setResultType('event'); setTurnState(p => ({ ...p, phase: 'result', currentCell: cell, isCorrect: true, actionToApply: act, actionMessage: act.message })); }
          else afterTurnComplete();
        } else afterTurnComplete();
      }, 1200);
    }, 800);
  }

  function afterTurnComplete() {
    if (isSimultaneous) { setTurnState(INITIAL_TURN_STATE); setUnanimousResult(null); isActingRef.current = false; }
    else { setTurnState(p => ({ ...p, phase: 'next', currentCell: null })); isActingRef.current = false; setTimeout(() => advanceTurn(), 1500); }
  }

  async function handleAnswer(choice: string) {
    if (isHost) return;
    const cs = sessionRef.current;
    const tid = isSimultaneous ? myTeamId : cs?.current_turn_team_id;
    const team = teamsRef.current.find(t => t.id === tid);
    if (!cs || !team || !turnState.currentQuiz || !turnState.currentCell) return;

    const stored = getStoredPlayer(gameCode);
    const isTeam = isTeamPlay(cs);
    const rule = getAnswerRule(cs);

    // ===== 全員一致モード =====
    if (isTeam && rule === 'unanimous' && stored?.playerId) {
      const isTimeout = choice === 'TIMEOUT';
      const selectedVal = isTimeout ? null : choice;

      // player_answers に自分の回答を書き込み
      const tn = await getCurrentTurnNumber(cs.id, team.id);
      await supabaseRef.current.from('player_answers').insert({
        game_session_id: cs.id,
        team_id: team.id,
        player_id: stored.playerId,
        quiz_id: turnState.currentQuiz.id,
        turn_number: tn,
        selected_answer: selectedVal,
      });

      // 自分の回答済みフラグを立てる
      setTurnState(p => ({ ...p, myAnswerSubmitted: true }));
      // → useEffect で teamAnswers の変更を検知して全員揃ったか判定
      return;
    }

    // ===== 誰か1人でOKモード or 個人戦 =====
    const ok = choice === turnState.currentQuiz.answer;
    const to = choice === 'TIMEOUT';

    if (ok) {
      await supabaseRef.current.from('teams')
        .update({ correct_count: team.correct_count + 1 })
        .eq('id', team.id);
    }

    // チーム戦の場合、player_answersにも記録（anyoneモード）
    if (isTeam && stored?.playerId) {
      const tn = await getCurrentTurnNumber(cs.id, team.id);
      await supabaseRef.current.from('player_answers').insert({
        game_session_id: cs.id,
        team_id: team.id,
        player_id: stored.playerId,
        quiz_id: turnState.currentQuiz.id,
        turn_number: tn,
        selected_answer: to ? null : choice,
      }).catch(() => { /* 重複挿入は無視 */ });
    }

    const aid = ok ? turnState.currentCell.correct_action_id : turnState.currentCell.wrong_action_id;
    const act = aid ? actionsRef.current.find(a => a.id === aid) ?? null : null;

    const tn = await getCurrentTurnNumber(cs.id, team.id);
    await supabaseRef.current.from('turn_events').insert({
      game_session_id: cs.id, team_id: team.id, turn_number: tn,
      event_type: 'answer',
      payload: {
        quiz_id: turnState.currentQuiz.id, selected: choice,
        correct_answer: turnState.currentQuiz.answer, is_correct: ok, is_timeout: to,
      },
    });

    setResultType('quiz');
    setTurnState(p => ({
      ...p, phase: 'result', selectedAnswer: choice,
      isCorrect: to ? null : ok, actionToApply: act, actionMessage: act?.message ?? null,
    }));
  }

  function dismissRemoteResult() {
    setTurnState(INITIAL_TURN_STATE); setIsGoalResult(false); setResultType('quiz'); setUnanimousResult(null);
  }

  async function handleResultContinue() {
    if (isHost) return;
    const cs = sessionRef.current;
    const tid = isSimultaneous ? myTeamId : cs?.current_turn_team_id;
    const team = teamsRef.current.find(t => t.id === tid);
    if (!cs || !team) return;

    setUnanimousResult(null);

    if (isGoalResult) {
      setIsGoalResult(false); isActingRef.current = false;
      await fetchTeams(cs.id);
      if (isSimultaneous) { setTurnState(INITIAL_TURN_STATE); await checkAllFinished(cs); }
      else setTimeout(() => advanceTurn(), 500);
      return;
    }

    const action = turnState.actionToApply;
    if (action) {
      const mx = Math.max(...cellsRef.current.map(c => c.cell_number));
      const updates = applyAction(team, action, mx);
      await supabaseRef.current.from('teams').update(updates).eq('id', team.id);

      const tn = await getCurrentTurnNumber(cs.id, team.id);
      await supabaseRef.current.from('turn_events').insert({
        game_session_id: cs.id, team_id: team.id, turn_number: tn,
        event_type: 'action',
        payload: { action_code: action.action_code, action_type: action.action_type, value: action.value, updates },
      });

      if (updates.is_finished) {
        await supabaseRef.current.from('teams').update({ is_finished: true, finished_turn: tn }).eq('id', team.id);
        await fetchTeams(cs.id);
        setIsGoalResult(true); setResultType('goal');
        setTurnState(p => ({ ...p, phase: 'result', isCorrect: true, actionToApply: null, currentQuiz: null, actionMessage: `${team.team_name} がゴールしました！🎉` }));
        isActingRef.current = false;
        return;
      }
    }

    await fetchTeams(cs.id); isActingRef.current = false;
    if (isSimultaneous) {
      const ut = teamsRef.current.find(t => t.id === team.id);
      if (ut?.roll_again) await supabaseRef.current.from('teams').update({ roll_again: false }).eq('id', team.id);
      setTurnState(INITIAL_TURN_STATE);
    } else {
      setTimeout(() => advanceTurn(), 500);
    }
  }

  async function handleGoal(team: Team, sess?: GameSession) {
    const s = sess ?? sessionRef.current; if (!s) return;
    const mx = Math.max(...cellsRef.current.map(c => c.cell_number));
    const tn = await getCurrentTurnNumber(s.id, team.id);
    await supabaseRef.current.from('teams').update({ is_finished: true, finished_turn: tn, current_position: mx }).eq('id', team.id);
    await fetchTeams(s.id);
    setIsGoalResult(true); setResultType('goal');
    setTurnState(p => ({ ...p, phase: 'result', isCorrect: true, actionToApply: null, actionMessage: `${team.team_name} がゴールしました！🎉` }));
  }

  async function handleForceEnd() {
    const s = sessionRef.current; if (!s) return;
    await supabaseRef.current.from('game_sessions')
      .update({ status: 'finished', finished_at: new Date().toISOString() })
      .eq('id', s.id);
    setShowEndConfirm(false);
    setTimeout(() => router.push(`/results/${gameCode}`), 1000);
  }

  async function checkAllFinished(s: GameSession) {
    const { data } = await supabaseRef.current.from('teams').select('*').eq('game_session_id', s.id);
    if (data && isGameFinished(data)) {
      await supabaseRef.current.from('game_sessions')
        .update({ status: 'finished', finished_at: new Date().toISOString() })
        .eq('id', s.id);
      setTimeout(() => router.push(`/results/${gameCode}`), 2000);
    }
  }

  async function advanceTurn() {
    if (isHost || isSimultaneous) return;
    const sb = supabaseRef.current;
    const { data: ls } = await sb.from('game_sessions').select('*').eq('game_code', gameCode).single();
    if (!ls) return;
    const { data: ltd } = await sb.from('teams').select('*').eq('game_session_id', ls.id).order('turn_order');
    let lt = ltd ?? [];
    if (isGameFinished(lt)) {
      await sb.from('game_sessions').update({ status: 'finished', finished_at: new Date().toISOString() }).eq('id', ls.id);
      setTimeout(() => router.push(`/results/${gameCode}`), 2000);
      return;
    }
    const cid = ls.current_turn_team_id ?? '';
    const { team: nt, isSameTeam } = getNextTurnTeam(lt, cid);
    if (!nt) {
      await sb.from('game_sessions').update({ status: 'finished', finished_at: new Date().toISOString() }).eq('id', ls.id);
      setTimeout(() => router.push(`/results/${gameCode}`), 2000);
      return;
    }
    if (isSameTeam) { await sb.from('teams').update({ roll_again: false }).eq('id', nt.id); setTurnState(INITIAL_TURN_STATE); return; }
    const ct = lt.find(t => t.id === cid);
    if (ct?.roll_again) await sb.from('teams').update({ roll_again: false }).eq('id', cid);
    let tt = nt;
    const at = lt.filter(t => !t.is_finished).sort((a, b) => (a.turn_order ?? 0) - (b.turn_order ?? 0));
    let attempts = 0;
    while (tt.pause_turns > 0 && attempts < at.length) {
      await sb.from('teams').update({ pause_turns: tt.pause_turns - 1 }).eq('id', tt.id);
      lt = lt.map(t => t.id === tt.id ? { ...t, pause_turns: t.pause_turns - 1 } : t);
      const { team: an } = getNextTurnTeam(lt, tt.id);
      if (!an || an.id === tt.id) break;
      tt = an; attempts++;
    }
    const ntn = ls.turn_number + 1;
    await sb.from('game_sessions').update({ current_turn_team_id: tt.id, turn_number: ntn }).eq('id', ls.id);
    setSession(p => p ? { ...p, current_turn_team_id: tt.id, turn_number: ntn } : p);
    setTurnState(INITIAL_TURN_STATE);
  }

  // ===== 表示ロジック =====
  const currentTurnTeam = teams.find(t => t.id === session?.current_turn_team_id);
  const myTeam = teams.find(t => t.id === myTeamId);
  const myTeamFinished = myTeam?.is_finished ?? false;
  const isMyTurn = isSimultaneous
    ? !isHost && !myTeamFinished && !(myTeam?.pause_turns && myTeam.pause_turns > 0)
    : !isHost && myTeamId === session?.current_turn_team_id;

  const canRoll = isMyTurn && turnState.phase === 'roll' && !rolling;

  // クイズ回答可能か判定
  const isTeam = isTeamPlay(session);
  const rule = getAnswerRule(session);
  // anyoneモード: isMyTurn（自チームのターンで自分が操作可能）
  // unanimousモード: 自チームのメンバー全員が回答可能（ターン制でも）
  const canAnswerQuiz = (() => {
    if (isHost) return false;
    if (turnState.phase !== 'quiz') return false;
    if (isTeam && rule === 'unanimous') {
      // unanimousモード: 自チームのターンなら全メンバーが回答可能
      const tid = isSimultaneous ? myTeamId : session?.current_turn_team_id;
      return myTeamId === tid && !turnState.myAnswerSubmitted;
    }
    return isMyTurn;
  })();

  const canContinue = isMyTurn;
  const resultAutoClose = isGoalResult ? 5 : (!canContinue ? 3 : undefined);
  const resultOnContinue = canContinue ? handleResultContinue : dismissRemoteResult;

  // クイズモーダルの readOnly 判定
  const quizReadOnly = (() => {
    if (isHost) return true;
    if (isTeam && rule === 'unanimous') {
      const tid = isSimultaneous ? myTeamId : session?.current_turn_team_id;
      if (myTeamId !== tid) return true; // 他チームのターン
      return turnState.myAnswerSubmitted; // 自分が回答済みなら readOnly（ただし待機UIが出る）
    }
    return !canAnswerQuiz;
  })();

  // unanimousモードのオンラインメンバー数
  const onlineMemberCount = teamMembers.filter(m => m.is_online).length || 1;

  if (session?.status === 'finished') return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-amber-50 to-white p-6 dark:from-gray-950 dark:to-gray-900">
      <div className="text-6xl mb-4">🏆</div>
      <h1 className="mb-2 text-3xl font-bold">ゲーム終了！</h1>
      <p className="mb-6 text-gray-500 animate-pulse">結果ページに移動します...</p>
      <a href={`/results/${gameCode}`} className="rounded-lg bg-indigo-600 px-6 py-3 font-bold text-white hover:bg-indigo-700">結果を見る →</a>
    </div>
  );
  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" /><p className="text-gray-500">ゲームを読み込み中...</p></div>
    </div>
  );
  if (error) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <div className="text-4xl">😵</div><p className="text-red-600 font-medium">{error}</p>
      <div className="flex gap-3">
        <button onClick={() => { setError(null); initGame(false); }} className="rounded-lg bg-indigo-600 px-6 py-2 font-medium text-white hover:bg-indigo-700">再読み込み</button>
        <a href="/" className="rounded-lg border border-gray-300 px-6 py-2 font-medium text-gray-700 hover:bg-gray-50">トップへ</a>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white dark:from-gray-950 dark:to-gray-900">
      <ConnectionBanner visible={connectionLost} />
      <header className="border-b border-gray-200 bg-white/80 px-4 py-2 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <span className="text-sm font-medium">{gameSet?.name}</span>
            {!isSimultaneous && <span className="ml-2 text-xs text-gray-500">ターン {session?.turn_number ?? 0}</span>}
            {isSimultaneous && <span className="ml-2 text-xs text-indigo-600 font-medium">⚡ 同時プレイ</span>}
            {isHost && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">👁 観戦モード</span>}
            {isTeam && rule === 'unanimous' && <span className="ml-2 text-xs text-purple-600 font-medium">🤝 全員一致</span>}
            {isTeam && rule === 'anyone' && <span className="ml-2 text-xs text-green-600 font-medium">✋ 早い者勝ち</span>}
          </div>
          <div className="flex items-center gap-2">
            {isSimultaneous ? (
              myTeam && !isHost && (
                <span className="flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium" style={{ backgroundColor: (myTeam.team_color ?? '#888') + '30' }}>
                  <span>{myTeam.team_emoji ?? myTeam.team_name.charAt(0)}</span>
                  <span>{myTeam.team_name}</span>
                  {myTeamFinished && <span className="ml-1">🏁</span>}
                </span>
              )
            ) : (
              currentTurnTeam && (
                <span className="flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium" style={{ backgroundColor: (currentTurnTeam.team_color ?? '#888') + '30' }}>
                  <span>{currentTurnTeam.team_emoji ?? currentTurnTeam.team_name.charAt(0)}</span>
                  <span>{currentTurnTeam.team_name}のターン</span>
                </span>
              )
            )}
            {isHost && <button onClick={() => setShowEndConfirm(true)} className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200">🛑 ゲーム終了</button>}
          </div>
        </div>
      </header>

      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl dark:bg-gray-900">
            <div className="mb-4 text-4xl">🛑</div>
            <h3 className="mb-2 text-lg font-bold">ゲームを終了しますか？</h3>
            <p className="mb-6 text-sm text-gray-500">現在の進捗で順位が決まります。この操作は取り消せません。</p>
            <div className="flex gap-3">
              <button onClick={() => setShowEndConfirm(false)} className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">キャンセル</button>
              <button onClick={handleForceEnd} className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700">終了する</button>
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-4 py-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2"><GameBoard cells={cells} teams={teams} columns={5} myTeamId={myTeamId} /></div>
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow dark:border-gray-800 dark:bg-gray-900">
              <DiceDisplay value={turnState.diceValue} rolling={rolling} />
              {turnState.phase === 'roll' && (
                <div className="mt-4 text-center">
                  {myTeamFinished ? (
                    <p className="text-sm text-green-600 font-medium">🏁 ゴール済み！他のプレイヤーを待っています...</p>
                  ) : canRoll ? (
                    <button onClick={handleRoll} className="rounded-xl bg-indigo-600 px-8 py-4 text-lg font-bold text-white shadow-lg hover:bg-indigo-700 active:scale-95 transition-transform">
                      🎲 サイコロを振る！
                    </button>
                  ) : (
                    <p className="text-gray-500 text-sm">
                      {isHost ? '観戦中...' : isSimultaneous ? (myTeam?.pause_turns && myTeam.pause_turns > 0 ? `1回休み（残り${myTeam.pause_turns}回）` : '待機中...') : `${currentTurnTeam?.team_name ?? ''}のターンです...`}
                    </p>
                  )}
                </div>
              )}
              {turnState.phase === 'moving' && turnState.diceValue && (
                <p className="mt-4 text-center text-xl font-bold text-indigo-600 animate-pulse">{turnState.diceValue} が出た！ 移動中...</p>
              )}
              {turnState.phase === 'next' && (
                <p className="mt-4 text-center text-sm text-gray-500">次のチームに交代中...</p>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow dark:border-gray-800 dark:bg-gray-900">
              <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">{isSimultaneous ? '🏃 進捗状況' : 'チーム状況'}</h3>
              <div className="space-y-2">
                {[...teams].sort((a, b) => b.current_position - a.current_position).map((team) => {
                  const mx = cells.length > 0 ? Math.max(...cells.map(c => c.cell_number)) : 1;
                  const pr = Math.round((team.current_position / mx) * 100);
                  const isCur = !isSimultaneous && team.id === session?.current_turn_team_id;
                  const isMe = team.id === myTeamId;
                  return (
                    <div key={team.id} className={`rounded-lg p-2 ${isCur ? 'ring-2 ring-indigo-500' : ''} ${isMe ? 'bg-indigo-50 dark:bg-indigo-950' : ''}`}>
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm" style={{ backgroundColor: team.team_color ?? '#888' }}>
                          {team.team_emoji ?? team.team_name.charAt(0)}
                        </span>
                        <span className="flex-1 text-sm font-medium truncate">
                          {team.team_name}
                          {isMe && <span className="ml-1 text-xs text-indigo-600">（あなた）</span>}
                          {team.is_finished && <span className="ml-1 text-xs">🏁</span>}
                        </span>
                        <span className="text-xs text-gray-500">{team.current_position}/{mx}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pr}%`, backgroundColor: team.team_color ?? '#888' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>

      {turnState.phase === 'quiz' && turnState.currentQuiz && (
        <QuizModal
          quiz={turnState.currentQuiz}
          timeLimit={gameSet?.answer_time_limit ?? 30}
          onAnswer={handleAnswer}
          readOnly={quizReadOnly}
          answerRule={rule}
          teamAnswers={turnState.teamAnswers.filter(a => a.quiz_id === turnState.currentQuiz?.id)}
          teamMemberCount={isTeam && rule === 'unanimous' ? onlineMemberCount : 1}
          myAnswerSubmitted={turnState.myAnswerSubmitted}
        />
      )}
      {turnState.phase === 'result' && (
        <ResultModal
          isCorrect={turnState.isCorrect}
          explanation={turnState.currentQuiz?.explanation ?? null}
          action={turnState.actionToApply}
          actionMessage={turnState.actionMessage}
          onContinue={resultOnContinue}
          canContinue={canContinue}
          autoCloseSeconds={resultAutoClose}
          resultType={resultType}
          unanimousInfo={unanimousResult}
        />
      )}
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="text-gray-500">ゲームを読み込み中...</p>
        </div>
      </div>
    }>
      <PlayContent />
    </Suspense>
  );
}
