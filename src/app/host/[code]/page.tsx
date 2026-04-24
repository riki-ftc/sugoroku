'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import QRCode from 'qrcode';

type GameSession = {
  id: string;
  game_code: string;
  game_set_id: string;
  host_name: string | null;
  status: 'waiting' | 'team_forming' | 'playing' | 'finished';
  play_mode: 'individual' | 'team';
  progress_mode: 'turn_based' | 'simultaneous';
  answer_rule: 'anyone' | 'unanimous';
  current_turn_team_id: string | null;
  turn_number: number;
  max_players: number;
  team_count: number;
  created_at: string;
  expires_at: string;
};

type GameSet = { id: string; name: string };

type Player = {
  id: string;
  player_name: string;
  team_id: string | null;
  is_spectator: boolean;
  is_online: boolean;
  joined_at: string;
};

type Team = {
  id: string;
  team_name: string;
  team_color: string | null;
  team_emoji: string | null;
  turn_order: number | null;
  is_individual: boolean;
};

const TEAM_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
  '#14B8A6', '#6366F1', '#D946EF', '#84CC16',
];
const TEAM_EMOJIS = ['🐶', '🐱', '🐼', '🦊', '🐸', '🐧', '🦁', '🐻', '🐰', '🐲', '🦄', '🐨'];
const TEAM_NAMES = ['チーム1', 'チーム2', 'チーム3', 'チーム4', 'チーム5', 'チーム6', 'チーム7', 'チーム8', 'チーム9', 'チーム10', 'チーム11', 'チーム12'];

export default function HostPage() {
  const params = useParams();
  const gameCode = params.code as string;

  const [session, setSession] = useState<GameSession | null>(null);
  const [gameSet, setGameSet] = useState<GameSet | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [starting, setStarting] = useState(false);
  const [forming, setForming] = useState(false);

  const supabaseRef = useRef(createClient());
  const sessionRef = useRef<GameSession | null>(null);

  useEffect(() => { sessionRef.current = session; }, [session]);

  // QRコード生成
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const joinUrl = `${window.location.origin}/join/${gameCode}`;
      QRCode.toDataURL(joinUrl, { width: 300, margin: 2, color: { dark: '#1F2937', light: '#FFFFFF' } })
        .then(setQrDataUrl);
    }
  }, [gameCode]);

  // 初期データ取得
  useEffect(() => {
    fetchData();
  }, [gameCode]);

  // Realtime購読
  useEffect(() => {
    if (!session) return;
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`host:${gameCode}:${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${session.id}` }, (payload) => {
        const updated = payload.new as GameSession;
        setSession(updated);
        sessionRef.current = updated;
        if (updated.status === 'playing') { window.location.href = `/play/${gameCode}?host=true`; }
        if (updated.status === 'finished') { window.location.href = `/results/${gameCode}`; }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_session_id=eq.${session.id}` }, () => {
        fetchPlayers(session.id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `game_session_id=eq.${session.id}` }, () => {
        fetchTeams(session.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.id, gameCode]);

  async function fetchData() {
    setLoading(true);
    const supabase = supabaseRef.current;
    const { data: sess, error: sessErr } = await supabase
      .from('game_sessions').select('*').eq('game_code', gameCode).single();
    if (sessErr || !sess) { setError('ゲームセッションが見つかりません'); setLoading(false); return; }
    if (sess.status === 'finished') { window.location.href = `/results/${gameCode}`; return; }
    if (sess.status === 'playing') { window.location.href = `/play/${gameCode}?host=true`; return; }
    setSession(sess);
    sessionRef.current = sess;
    const { data: gs } = await supabase.from('game_sets').select('id, name').eq('id', sess.game_set_id).single();
    setGameSet(gs ?? null);
    await fetchPlayers(sess.id);
    await fetchTeams(sess.id);
    setLoading(false);
  }

  async function fetchPlayers(sessionId: string) {
    const { data } = await supabaseRef.current.from('players').select('*').eq('game_session_id', sessionId).order('joined_at');
    setPlayers(data ?? []);
  }

  async function fetchTeams(sessionId: string) {
    const { data } = await supabaseRef.current.from('teams').select('*').eq('game_session_id', sessionId).order('turn_order');
    setTeams(data ?? []);
  }

  // ==================== チーム編成 ====================
  async function handleFormTeams() {
    if (!session) return;
    setForming(true);
    setError(null);
    const supabase = supabaseRef.current;
    const activePlayers = players.filter((p) => !p.is_spectator);
    const teamCount = session.team_count;

    if (activePlayers.length < 2) {
      setError('参加者が2人以上必要です');
      setForming(false);
      return;
    }

    try {
      // 既存チームを削除（再編成時）
      const existingTeams = teams.filter((t) => !t.is_individual);
      if (existingTeams.length > 0) {
        // playersのteam_idを先にNULLに
        await supabase.from('players').update({ team_id: null }).eq('game_session_id', session.id);
        // チーム削除
        for (const t of existingTeams) {
          await supabase.from('teams').delete().eq('id', t.id);
        }
      }

      // チーム作成
      const newTeams: { id: string; team_name: string }[] = [];
      for (let i = 0; i < teamCount; i++) {
        const { data: t, error: tErr } = await supabase.from('teams').insert({
          game_session_id: session.id,
          team_name: TEAM_NAMES[i] ?? `チーム${i + 1}`,
          team_color: TEAM_COLORS[i % TEAM_COLORS.length],
          team_emoji: TEAM_EMOJIS[i % TEAM_EMOJIS.length],
          turn_order: i,
          current_position: 0,
          is_individual: false,
        }).select('id, team_name').single();
        if (tErr || !t) throw new Error('チーム作成失敗: ' + (tErr?.message ?? ''));
        newTeams.push(t);
      }

      // ランダム割当
      const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
      for (let i = 0; i < shuffled.length; i++) {
        const teamIdx = i % teamCount;
        await supabase.from('players').update({ team_id: newTeams[teamIdx].id }).eq('id', shuffled[i].id);
      }

      // ステータス変更
      await supabase.from('game_sessions').update({
        status: 'team_forming',
        play_mode: 'team',
      }).eq('id', session.id);

      await fetchTeams(session.id);
      await fetchPlayers(session.id);
    } catch (e: any) {
      setError(e.message ?? 'チーム編成に失敗しました');
    }
    setForming(false);
  }

  // ランダム再分け
  async function handleReshuffle() {
    if (!session) return;
    setForming(true);
    const supabase = supabaseRef.current;
    const activePlayers = players.filter((p) => !p.is_spectator);
    const currentTeams = teams.filter((t) => !t.is_individual);
    if (currentTeams.length === 0) { setForming(false); return; }

    // 全員のteam_idをNULL
    await supabase.from('players').update({ team_id: null }).eq('game_session_id', session.id);
    // ランダム再割当
    const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      const teamIdx = i % currentTeams.length;
      await supabase.from('players').update({ team_id: currentTeams[teamIdx].id }).eq('id', shuffled[i].id);
    }
    await fetchPlayers(session.id);
    setForming(false);
  }

  // 参加者を追加（個人戦ロビーに戻す）
  async function handleBackToWaiting() {
    if (!session) return;
    const supabase = supabaseRef.current;
    await supabase.from('game_sessions').update({
      status: 'waiting',
      play_mode: 'individual',
    }).eq('id', session.id);
  }

  // チーム数変更
  async function handleTeamCountChange(newCount: number) {
    if (!session) return;
    await supabaseRef.current.from('game_sessions').update({ team_count: newCount }).eq('id', session.id);
    setSession((prev) => prev ? { ...prev, team_count: newCount } : prev);
    // チーム戦ロビーなら再編成
    if (session.status === 'team_forming') {
      // 少し待ってから再編成（state更新待ち）
      setTimeout(() => handleFormTeams(), 200);
    }
  }

  // 進行方式変更
  async function handleProgressModeChange(mode: 'turn_based' | 'simultaneous') {
    if (!session) return;
    await supabaseRef.current.from('game_sessions').update({ progress_mode: mode }).eq('id', session.id);
    setSession((prev) => prev ? { ...prev, progress_mode: mode } : prev);
  }

  // 回答ルール変更
  async function handleAnswerRuleChange(rule: 'anyone' | 'unanimous') {
    if (!session) return;
    await supabaseRef.current.from('game_sessions').update({ answer_rule: rule }).eq('id', session.id);
    setSession((prev) => prev ? { ...prev, answer_rule: rule } : prev);
  }

  // ==================== ゲーム開始 ====================
  async function handleStartIndividual() {
    if (!session) return;
    const activePlayers = players.filter((p) => !p.is_spectator);
    if (activePlayers.length < 2) { setError('参加者が2人以上必要です'); return; }
    setStarting(true);
    setError(null);
    const supabase = supabaseRef.current;

    try {
      // 既存チーム削除
      await supabase.from('players').update({ team_id: null }).eq('game_session_id', session.id);
      const existingTeams = teams.filter((t) => t.is_individual || !t.is_individual);
      for (const t of existingTeams) {
        await supabase.from('teams').delete().eq('id', t.id);
      }

      // 1人1チーム作成
      const sortedPlayers = activePlayers.sort((a, b) => a.joined_at.localeCompare(b.joined_at));
      let firstTeamId: string | null = null;
      for (let i = 0; i < sortedPlayers.length; i++) {
        // HSLで均等に色生成
        const hue = Math.round((360 / sortedPlayers.length) * i);
        const color = `hsl(${hue}, 70%, 50%)`;
        const { data: t, error: tErr } = await supabase.from('teams').insert({
          game_session_id: session.id,
          team_name: sortedPlayers[i].player_name,
          team_color: color,
          team_emoji: null,
          turn_order: i,
          current_position: 0,
          is_individual: true,
        }).select('id').single();
        if (tErr || !t) throw new Error('チーム作成失敗');
        if (i === 0) firstTeamId = t.id;
        await supabase.from('players').update({ team_id: t.id }).eq('id', sortedPlayers[i].id);
      }

      // ゲーム開始
      await supabase.from('game_sessions').update({
        status: 'playing',
        play_mode: 'individual',
        current_turn_team_id: session.progress_mode === 'turn_based' ? firstTeamId : null,
        turn_number: 1,
        started_at: new Date().toISOString(),
      }).eq('id', session.id);
    } catch (e: any) {
      setError(e.message ?? '開始に失敗しました');
      setStarting(false);
    }
  }

  async function handleStartTeam() {
    if (!session) return;
    const currentTeams = teams.filter((t) => !t.is_individual);
    if (currentTeams.length < 2) { setError('チームが2つ以上必要です'); return; }
    const unassigned = players.filter((p) => !p.is_spectator && !p.team_id);
    if (unassigned.length > 0) { setError(`未割当の参加者が${unassigned.length}人います`); return; }
    setStarting(true);
    setError(null);
    const supabase = supabaseRef.current;

    try {
      const firstTeam = currentTeams.sort((a, b) => (a.turn_order ?? 0) - (b.turn_order ?? 0))[0];
      await supabase.from('game_sessions').update({
        status: 'playing',
        play_mode: 'team',
        current_turn_team_id: session.progress_mode === 'turn_based' ? firstTeam.id : null,
        turn_number: 1,
        started_at: new Date().toISOString(),
      }).eq('id', session.id);
    } catch (e: any) {
      setError(e.message ?? '開始に失敗しました');
      setStarting(false);
    }
  }

  // ==================== レンダリング ====================
  if (loading) {
    return (<div className="flex min-h-screen items-center justify-center"><div className="text-center"><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" /><p className="text-gray-500">読み込み中...</p></div></div>);
  }
  if (error && !session) {
    return (<div className="flex min-h-screen items-center justify-center"><div className="text-center"><p className="text-red-600">{error}</p><a href="/admin" className="mt-4 inline-block text-sm text-blue-600 hover:underline">← 管理画面に戻る</a></div></div>);
  }
  if (!session) return null;

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join/${gameCode}` : `/join/${gameCode}`;
  const isExpired = new Date(session.expires_at) < new Date();
  const activePlayers = players.filter((p) => !p.is_spectator);
  const isTeamForming = session.status === 'team_forming';
  const showTurnWarning = session.progress_mode === 'turn_based' && activePlayers.length >= 20;

  // チームごとにプレイヤーをグループ化
  const teamGroups = teams.filter((t) => !t.is_individual).map((team) => ({
    ...team,
    members: players.filter((p) => p.team_id === team.id && !p.is_spectator),
  }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white dark:from-gray-950 dark:to-gray-900">
      <header className="border-b border-gray-200 bg-white/80 px-6 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <a href="/admin" className="text-sm text-gray-500 hover:text-gray-700">← 管理画面</a>
          <div className="text-sm text-gray-500">{gameSet?.name ?? 'ゲーム'} ・ {session.host_name ?? 'ホスト'}</div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        {error && (<div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</div>)}
        {isExpired && (<div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">⚠️ このゲームセッションは期限切れです。</div>)}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* 左側: QR + コード */}
          <div className="text-center">
            <div className="inline-block rounded-2xl bg-white p-4 shadow-lg dark:bg-gray-900">
              {qrDataUrl && <img src={qrDataUrl} alt="QR Code" className="mx-auto h-48 w-48" />}
              <div className="mt-3 rounded-lg bg-gray-100 px-4 py-3 dark:bg-gray-800">
                <p className="text-xs text-gray-500">ゲームコード</p>
                <p className="font-mono text-2xl font-bold tracking-[0.3em] text-indigo-600">{session.game_code}</p>
              </div>
              <button onClick={() => { navigator.clipboard?.writeText(joinUrl); }} className="mt-2 rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50">📋 URLをコピー</button>
            </div>
          </div>

          {/* 中央 + 右側 */}
          <div className="lg:col-span-2 space-y-4">
            {/* 設定パネル */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow dark:border-gray-800 dark:bg-gray-900">
              <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">⚙️ 設定</h3>
              <div className="space-y-3">
                {/* 進行方式 */}
                <div>
                  <p className="mb-1 text-xs text-gray-500">進行方式</p>
                  <div className="flex gap-2">
                    <button onClick={() => handleProgressModeChange('turn_based')}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${session.progress_mode === 'turn_based' ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      🔄 ターン制</button>
                    <button onClick={() => handleProgressModeChange('simultaneous')}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${session.progress_mode === 'simultaneous' ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      ⚡ 同時プレイ</button>
                  </div>
                </div>

                {/* チーム戦時のみ: 回答ルール + チーム数 */}
                {isTeamForming && (
                  <>
                    <div>
                      <p className="mb-1 text-xs text-gray-500">回答ルール</p>
                      <div className="flex gap-2">
                        <button onClick={() => handleAnswerRuleChange('anyone')}
                          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${session.answer_rule === 'anyone' ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          ☁ 誰か1人でOK</button>
                        <button onClick={() => handleAnswerRuleChange('unanimous')}
                          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${session.answer_rule === 'unanimous' ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          🤝 全員一致</button>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-gray-500">チーム数</p>
                      <select value={session.team_count} onChange={(e) => handleTeamCountChange(Number(e.target.value))}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800">
                        {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (<option key={n} value={n}>{n}チーム</option>))}
                      </select>
                    </div>
                  </>
                )}
              </div>

              {showTurnWarning && (
                <div className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  ⚠️ ターン制×{activePlayers.length}人: 待ち時間が長くなります。同時プレイがおすすめです。
                </div>
              )}
            </div>

            {/* 参加者 / チーム表示 */}
            {isTeamForming ? (
              /* チーム戦ロビー */
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow dark:border-gray-800 dark:bg-gray-900">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">👥 チーム編成</h3>
                  <button onClick={handleReshuffle} disabled={forming}
                    className="rounded-lg bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-200 disabled:opacity-50">
                    🔀 ランダム再分け</button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {teamGroups.map((group) => (
                    <div key={group.id} className="rounded-lg border-2 p-3" style={{ borderColor: group.team_color ?? '#ccc', backgroundColor: (group.team_color ?? '#ccc') + '10' }}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-lg">{group.team_emoji ?? '👥'}</span>
                        <span className="font-medium text-sm">{group.team_name}</span>
                        <span className="text-xs text-gray-400">({group.members.length}人)</span>
                      </div>
                      <div className="space-y-0.5">
                        {group.members.map((m) => (
                          <p key={m.id} className="text-xs text-gray-700 dark:text-gray-300">{m.player_name}</p>
                        ))}
                        {group.members.length === 0 && <p className="text-xs text-gray-400 italic">メンバーなし</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* 個人戦ロビー */
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow dark:border-gray-800 dark:bg-gray-900">
                <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                  👥 参加者 ({activePlayers.length}人 / {session.max_players})
                </h3>
                {activePlayers.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center dark:border-gray-700">
                    <p className="text-2xl">🕐</p>
                    <p className="mt-2 text-gray-500">生徒の参加を待っています...</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {activePlayers.map((p) => (
                      <span key={p.id} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        {p.player_name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* アクションボタン */}
            <div className="flex flex-wrap gap-3">
              {isTeamForming ? (
                <>
                  <button onClick={handleBackToWaiting}
                    className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                    ← 参加者を追加（個人戦ロビーに戻る）</button>
                  <button onClick={handleStartTeam} disabled={starting || isExpired}
                    className="flex-1 rounded-lg bg-green-600 px-6 py-3 text-lg font-bold text-white shadow-lg hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {starting ? '開始中...' : '🚀 チーム戦で開始！'}</button>
                </>
              ) : (
                <>
                  <button onClick={handleStartIndividual} disabled={starting || isExpired || activePlayers.length < 2}
                    className="flex-1 rounded-lg bg-green-600 px-6 py-3 font-bold text-white shadow-lg hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {starting ? '開始中...' : activePlayers.length < 2 ? `あと${2 - activePlayers.length}人必要` : '🚀 個人戦で開始！'}</button>
                  <button onClick={handleFormTeams} disabled={forming || isExpired || activePlayers.length < 2}
                    className="flex-1 rounded-lg bg-indigo-600 px-6 py-3 font-bold text-white shadow-lg hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {forming ? '編成中...' : '👥 チーム編成へ →'}</button>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
