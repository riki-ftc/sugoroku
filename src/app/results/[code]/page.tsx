'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Team { id: string; team_name: string; team_emoji: string | null; team_color: string | null; current_position: number; correct_count: number; is_finished: boolean; finished_turn: number | null; turn_order: number; is_individual: boolean; }
interface GameSession { id: string; game_code: string; game_set_id: string; status: string; turn_number: number; play_mode: string; progress_mode: string; created_at: string; started_at: string | null; finished_at: string | null; }
interface GameSet { id: string; name: string; description: string | null; }
interface TurnEvent { id: string; team_id: string; turn_number: number; event_type: string; payload: Record<string, any>; created_at: string; }
interface TeamStats { team: Team; rank: number; totalAnswered: number; correctRate: number; diceRolls: number; avgDiceValue: number; actionsReceived: number; }

function ResultsContent() {
  const params = useParams(); const searchParams = useSearchParams(); const gameCode = params.code as string; const isHost = searchParams.get('host') === 'true';
  const [session, setSession] = useState<GameSession | null>(null); const [gameSet, setGameSet] = useState<GameSet | null>(null);
  const [teams, setTeams] = useState<Team[]>([]); const [turnEvents, setTurnEvents] = useState<TurnEvent[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ranking' | 'stats' | 'timeline'>('ranking');
  const [showConfetti, setShowConfetti] = useState(true); const [myTeamId, setMyTeamId] = useState<string | null>(null); const [resetting, setResetting] = useState(false);
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    if (typeof window !== 'undefined') { const raw = sessionStorage.getItem(`player_${gameCode}`); if (raw) { try { setMyTeamId(JSON.parse(raw).teamId); } catch {} } }
    loadResults(); const timer = setTimeout(() => setShowConfetti(false), 4000); return () => clearTimeout(timer);
  }, [gameCode]);

  useEffect(() => {
    if (!session) return; const supabase = supabaseRef.current;
    const channel = supabase.channel(`results:${gameCode}:${Date.now()}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_sessions', filter: `id=eq.${session.id}` }, (payload) => { const updated = payload.new as GameSession; if (updated.status === 'waiting') window.location.href = `/lobby/${gameCode}`; }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.id, gameCode]);

  async function loadResults() {
    setLoading(true); const supabase = supabaseRef.current;
    const { data: sess, error: sessErr } = await supabase.from('game_sessions').select('*').eq('game_code', gameCode).single();
    if (sessErr || !sess) { setError('ゲームセッションが見つかりません'); setLoading(false); return; } setSession(sess);
    const { data: gs } = await supabase.from('game_sets').select('*').eq('id', sess.game_set_id).single(); setGameSet(gs ?? null);
    const { data: td } = await supabase.from('teams').select('*').eq('game_session_id', sess.id).order('turn_order'); setTeams(td ?? []);
    const { data: ed } = await supabase.from('turn_events').select('*').eq('game_session_id', sess.id).order('created_at', { ascending: true }); setTurnEvents(ed ?? []); setLoading(false);
  }

  async function handlePlayAgain() {
    if (!session) return; setResetting(true); const supabase = supabaseRef.current;
    try {
      await supabase.from('turn_events').delete().eq('game_session_id', session.id);
      await supabase.from('player_answers').delete().eq('game_session_id', session.id);
      await supabase.from('players').update({ team_id: null }).eq('game_session_id', session.id);
      await supabase.from('teams').delete().eq('game_session_id', session.id);
      await supabase.from('players').update({ is_spectator: false }).eq('game_session_id', session.id);
      await supabase.from('game_sessions').update({ status: 'waiting', play_mode: 'individual', current_turn_team_id: null, turn_number: 0, started_at: null, finished_at: null }).eq('id', session.id);
      window.location.href = `/host/${gameCode}`;
    } catch { setResetting(false); alert('リセットに失敗しました。もう一度お試しください。'); }
  }

  function getRankedTeams(): TeamStats[] {
    const sorted = [...teams].sort((a, b) => { if (a.is_finished && !b.is_finished) return -1; if (!a.is_finished && b.is_finished) return 1; if (a.finished_turn && b.finished_turn) return a.finished_turn - b.finished_turn; if (a.current_position !== b.current_position) return b.current_position - a.current_position; return b.correct_count - a.correct_count; });
    return sorted.map((team, idx) => { const te = turnEvents.filter(e => e.team_id === team.id); const de = te.filter(e => e.event_type === 'dice_roll'); const ae = te.filter(e => e.event_type === 'answer'); const ace = te.filter(e => e.event_type === 'action'); const ca = ae.filter(e => e.payload?.is_correct === true); const dv = de.map(e => e.payload?.dice_value ?? 0); const avg = dv.length > 0 ? dv.reduce((s, v) => s + v, 0) / dv.length : 0; return { team, rank: idx + 1, totalAnswered: ae.length, correctRate: ae.length > 0 ? Math.round((ca.length / ae.length) * 100) : 0, diceRolls: de.length, avgDiceValue: Math.round(avg * 10) / 10, actionsReceived: ace.length }; });
  }

  function getGameDuration(): string { if (!session?.started_at || !session?.finished_at) return '不明'; const d = new Date(session.finished_at).getTime() - new Date(session.started_at).getTime(); const m = Math.floor(d / 60000); const s = Math.floor((d % 60000) / 1000); if (m > 0) return `${m}分${s}秒`; return `${s}秒`; }

  const rankEmoji = (r: number) => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `${r}位`;
  const rankedTeams = getRankedTeams(); const myRank = rankedTeams.find(i => i.team.id === myTeamId);
  const modeLabel = session?.progress_mode === 'simultaneous' ? '同時プレイ' : 'ターン制';
  const playModeLabel = session?.play_mode === 'team' ? 'チーム戦' : '個人戦';

  if (loading) return (<div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-amber-50 to-white dark:from-gray-950 dark:to-gray-900"><div className="text-center"><div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-amber-400 border-t-transparent" /><p className="text-gray-500">結果を集計中...</p></div></div>);
  if (error) return (<div className="flex min-h-screen items-center justify-center"><div className="text-center"><p className="mb-4 text-red-600">{error}</p><a href="/" className="text-indigo-600 underline">トップへ戻る</a></div></div>);

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {showConfetti && (<div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">{Array.from({ length: 40 }, (_, i) => (<div key={i} className="absolute" style={{ left: `${Math.random() * 100}%`, top: `-${Math.random() * 20}%`, fontSize: `${Math.random() * 16 + 12}px`, animation: `confetti-fall ${2 + Math.random() * 3}s ease-in forwards`, animationDelay: `${Math.random() * 0.5}s` }}>{['🎉','🎊','⭐','✨','🌟','🏆'][Math.floor(Math.random() * 6)]}</div>))}<style>{`@keyframes confetti-fall { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } }`}</style></div>)}
      <header className="border-b border-amber-200/50 bg-white/80 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80"><div className="mx-auto flex max-w-3xl items-center justify-between"><h1 className="text-lg font-bold">🏆 ゲーム結果</h1><div className="flex items-center gap-2"><span className="text-sm text-gray-500">{gameSet?.name}</span><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800">{playModeLabel} ・ {modeLabel}</span></div></div></header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        {myRank && !isHost && (<div className="mb-6 text-center"><div className="mb-2 text-5xl">{rankEmoji(myRank.rank)}</div><h2 className="mb-1 text-2xl font-bold">あなたの順位</h2><div className="inline-flex items-center gap-3 rounded-2xl border-2 px-6 py-4 shadow-lg" style={{ borderColor: myRank.rank === 1 ? '#fbbf24' : myRank.rank === 2 ? '#9ca3af' : myRank.rank === 3 ? '#f59e0b' : '#e5e7eb', backgroundColor: myRank.rank === 1 ? '#fffbeb' : '#f9fafb' }}><span className="flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow" style={{ backgroundColor: myRank.team.team_color ?? '#888' }}>{myRank.team.team_emoji ?? myRank.team.team_name.charAt(0)}</span><div className="text-left"><p className="text-xl font-bold">{myRank.team.team_name}</p><p className="text-sm text-gray-600">{teams.length}チーム中 {myRank.rank}位 ・ 正解率 {myRank.correctRate}%{myRank.team.finished_turn && ` ・ ${myRank.team.finished_turn}ターンでゴール`}</p></div></div></div>)}
        {(isHost || !myRank) && rankedTeams[0] && (<div className="mb-8 text-center"><div className="mb-2 text-5xl">🏆</div><h2 className="mb-1 text-3xl font-bold text-amber-600 dark:text-amber-400">優勝！</h2><div className="inline-flex items-center gap-3 rounded-2xl border-2 border-amber-400 bg-amber-50 px-6 py-4 shadow-lg dark:bg-amber-950"><span className="flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow" style={{ backgroundColor: rankedTeams[0].team.team_color ?? '#fbbf24' }}>{rankedTeams[0].team.team_emoji ?? '🏆'}</span><div className="text-left"><p className="text-xl font-bold">{rankedTeams[0].team.team_name}</p><p className="text-sm text-amber-700 dark:text-amber-300">正解 {rankedTeams[0].team.correct_count}問 ・ 正解率 {rankedTeams[0].correctRate}%{rankedTeams[0].team.finished_turn && ` ・ ${rankedTeams[0].team.finished_turn}ターン`}</p></div></div></div>)}
        <div className="mb-6 grid grid-cols-3 gap-3"><div className="rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900"><p className="text-2xl font-bold text-indigo-600">{session?.turn_number ?? 0}</p><p className="text-xs text-gray-500">総ターン数</p></div><div className="rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900"><p className="text-2xl font-bold text-indigo-600">{getGameDuration()}</p><p className="text-xs text-gray-500">プレイ時間</p></div><div className="rounded-xl border border-gray-200 bg-white p-4 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900"><p className="text-2xl font-bold text-indigo-600">{teams.length}</p><p className="text-xs text-gray-500">参加チーム数</p></div></div>
        <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">{([{ key: 'ranking' as const, label: '🏅 順位' }, { key: 'stats' as const, label: '📊 成績詳細' }, { key: 'timeline' as const, label: '📜 タイムライン' }]).map(({ key, label }) => (<button key={key} onClick={() => setActiveTab(key)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${activeTab === key ? 'bg-white text-indigo-700 shadow dark:bg-gray-700 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>{label}</button>))}</div>

        {activeTab === 'ranking' && (<div className="space-y-3">{rankedTeams.map((item) => { const isMe = item.team.id === myTeamId; return (<div key={item.team.id} className={`flex items-center gap-4 rounded-xl p-4 shadow-sm transition-all ${isMe ? 'border-2 border-indigo-400 bg-indigo-50 dark:bg-indigo-950' : item.rank === 1 ? 'border-2 border-amber-400 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950' : item.rank === 2 ? 'border border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900' : item.rank === 3 ? 'border border-amber-200 bg-orange-50/50 dark:border-amber-800 dark:bg-orange-950/30' : 'border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'}`}><span className="text-3xl">{rankEmoji(item.rank)}</span><span className="flex h-12 w-12 items-center justify-center rounded-full text-xl shadow" style={{ backgroundColor: item.team.team_color ?? '#888' }}>{item.team.team_emoji ?? item.team.team_name.charAt(0)}</span><div className="flex-1"><p className="text-lg font-bold">{item.team.team_name}{isMe && <span className="ml-2 text-sm text-indigo-600">（あなた）</span>}</p><p className="text-sm text-gray-500">マス {item.team.current_position} ・ 正解 {item.team.correct_count}問{item.team.is_finished && item.team.finished_turn ? ` ・ ${item.team.finished_turn}ターンでゴール 🏁` : ''}</p></div><div className="text-right"><p className="text-2xl font-bold text-indigo-600">{item.correctRate}%</p><p className="text-xs text-gray-500">正解率</p></div></div>); })}</div>)}

        {activeTab === 'stats' && (<div className="space-y-4">{rankedTeams.map((item) => (<div key={item.team.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"><div className="mb-4 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full text-lg shadow" style={{ backgroundColor: item.team.team_color ?? '#888' }}>{item.team.team_emoji ?? item.team.team_name.charAt(0)}</span><div><p className="font-bold">{item.team.team_name}{item.team.id === myTeamId && <span className="ml-2 text-sm text-indigo-600">（あなた）</span>}</p><p className="text-xs text-gray-500">{rankEmoji(item.rank)}</p></div></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-lg bg-green-50 p-3 text-center dark:bg-green-950"><p className="text-xl font-bold text-green-700 dark:text-green-300">{item.team.correct_count}</p><p className="text-xs text-green-600 dark:text-green-400">正解数</p></div><div className="rounded-lg bg-blue-50 p-3 text-center dark:bg-blue-950"><p className="text-xl font-bold text-blue-700 dark:text-blue-300">{item.correctRate}%</p><p className="text-xs text-blue-600 dark:text-blue-400">正解率</p></div><div className="rounded-lg bg-purple-50 p-3 text-center dark:bg-purple-950"><p className="text-xl font-bold text-purple-700 dark:text-purple-300">{item.diceRolls}</p><p className="text-xs text-purple-600 dark:text-purple-400">サイコロ回数</p></div><div className="rounded-lg bg-amber-50 p-3 text-center dark:bg-amber-950"><p className="text-xl font-bold text-amber-700 dark:text-amber-300">{item.avgDiceValue}</p><p className="text-xs text-amber-600 dark:text-amber-400">平均出目</p></div></div><div className="mt-3"><div className="flex justify-between text-xs text-gray-500"><span>解答数: {item.totalAnswered}問</span><span>正解: {item.team.correct_count} / 不正解: {item.totalAnswered - item.team.correct_count}</span></div><div className="mt-1 flex h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"><div className="bg-green-500 transition-all duration-500" style={{ width: `${item.correctRate}%` }} /><div className="bg-red-400 transition-all duration-500" style={{ width: `${100 - item.correctRate}%` }} /></div></div></div>))}</div>)}

        {activeTab === 'timeline' && (<div className="space-y-2">{turnEvents.length === 0 ? (<p className="py-8 text-center text-gray-500">イベントデータがありません</p>) : turnEvents.filter(e => e.event_type === 'dice_roll' || e.event_type === 'answer').map((event) => { const team = teams.find(t => t.id === event.team_id); if (!team) return null; const isDice = event.event_type === 'dice_roll'; const isAnswer = event.event_type === 'answer'; return (<div key={event.id} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs shadow" style={{ backgroundColor: team.team_color ?? '#888' }}>{team.team_emoji ?? team.team_name.charAt(0)}</span><div className="flex-1"><p className="text-sm"><span className="font-medium">{team.team_name}</span>{isDice && (<span className="text-gray-600 dark:text-gray-400"> がサイコロを振った → 🎲 {event.payload?.dice_value}（マス {event.payload?.from_position} → {event.payload?.target_position}）</span>)}{isAnswer && (<span className={event.payload?.is_correct ? 'text-green-600' : 'text-red-600'}> {event.payload?.is_correct ? '⭕ 正解！' : event.payload?.is_timeout ? '⏰ 時間切れ' : '❌ 不正解'}<span className="text-gray-400"> ({event.payload?.selected}を選択)</span></span>)}</p><p className="text-xs text-gray-400">ターン {event.turn_number}</p></div></div>); })}</div>)}

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          {isHost && (<button onClick={handlePlayAgain} disabled={resetting} className="w-full rounded-xl bg-green-600 px-8 py-3 text-center font-bold text-white shadow-lg hover:bg-green-700 disabled:opacity-50 sm:w-auto">{resetting ? 'リセット中...' : '🔄 もう一度プレイ'}</button>)}
          <a href="/" className="w-full rounded-xl bg-indigo-600 px-8 py-3 text-center font-bold text-white shadow-lg hover:bg-indigo-700 sm:w-auto">トップへ戻る</a>
          <button onClick={() => { if (typeof window !== 'undefined') { navigator.clipboard?.writeText(window.location.href); alert('結果ページのURLをコピーしました'); } }} className="w-full rounded-xl border border-gray-300 bg-white px-8 py-3 text-center font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 sm:w-auto">📋 結果をシェア</button>
        </div>
      </main>
    </div>
  );
}

export default function ResultsPage() { return (<Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-amber-50 to-white dark:from-gray-950 dark:to-gray-900"><div className="text-center"><div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-amber-400 border-t-transparent" /><p className="text-gray-500">結果を集計中...</p></div></div>}><ResultsContent /></Suspense>); }
