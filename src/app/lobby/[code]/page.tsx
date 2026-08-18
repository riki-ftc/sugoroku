'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type GameSession = {
  id: string;
  game_code: string;
  game_set_id: string;
  host_name: string | null;
  status: 'waiting' | 'team_forming' | 'playing' | 'finished';
  play_mode: 'individual' | 'team';
  progress_mode: 'turn_based' | 'simultaneous';
  answer_rule: 'anyone' | 'unanimous';
  max_players: number;
  team_count: number;
  expires_at: string;
};

type GameSet = {
  id: string;
  name: string;
};

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
};

export default function LobbyPage() {
  const params = useParams();
  const router = useRouter();
  const gameCode = params.code as string;

  const [session, setSession] = useState<GameSession | null>(null);
  const [gameSet, setGameSet] = useState<GameSet | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [myPlayerName, setMyPlayerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabaseRef = useRef(createClient());

  // sessionStorageからプレイヤー情報を取得
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(`player_${gameCode}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setMyPlayerId(parsed.playerId);
          setMyPlayerName(parsed.playerName);
        } catch {}
      } else {
        // 未参加ならjoinへリダイレクト
        router.push(`/join/${gameCode}`);
      }
    }
  }, [gameCode, router]);

  // データ取得 + Realtime購読
  useEffect(() => {
    if (!myPlayerId) return;
    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null;

    async function init() {
      setLoading(true);
      const supabase = supabaseRef.current;

      // セッション取得
      const { data: sess, error: sessErr } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('game_code', gameCode)
        .single();

      if (sessErr || !sess) {
        setError('ゲームが見つかりません');
        setLoading(false);
        return;
      }

      // ゲーム開始済みならplayへ
      if (sess.status === 'playing') {
        window.location.href = `/play/${gameCode}`;
        return;
      }
      if (sess.status === 'finished') {
        window.location.href = `/results/${gameCode}`;
        return;
      }

      setSession(sess);

      // ゲームセット名
      const { data: gs } = await supabase
        .from('game_sets')
        .select('id, name')
        .eq('id', sess.game_set_id)
        .single();
      setGameSet(gs ?? null);

      // プレイヤー一覧
      await fetchPlayers(sess.id);
      // チーム一覧
      await fetchTeams(sess.id);

      setLoading(false);

      // Realtime購読
      channel = supabase
        .channel(`lobby:${gameCode}:${Date.now()}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'game_sessions',
          filter: `id=eq.${sess.id}`,
        }, (payload) => {
          const updated = payload.new as GameSession;
          setSession(updated);
          if (updated.status === 'playing') {
            window.location.href = `/play/${gameCode}`;
          }
          if (updated.status === 'finished') {
            window.location.href = `/results/${gameCode}`;
          }
        })
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'players',
          filter: `game_session_id=eq.${sess.id}`,
        }, () => {
          fetchPlayers(sess.id);
        })
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'teams',
          filter: `game_session_id=eq.${sess.id}`,
        }, () => {
          fetchTeams(sess.id);
          fetchPlayers(sess.id); // team_idが変わった可能性
        })
        .subscribe();
    }

    init();

    return () => {
      if (channel) supabaseRef.current.removeChannel(channel);
    };
  }, [gameCode, myPlayerId, router]);

  async function fetchPlayers(sessionId: string) {
    const { data } = await supabaseRef.current
      .from('players')
      .select('*')
      .eq('game_session_id', sessionId)
      .eq('is_spectator', false)
      .order('joined_at');
    const p = data ?? [];
    setPlayers(p);

    // 自分のteam_idが変わっていたらsessionStorageを更新
    const me = p.find((pl) => pl.id === myPlayerId);
    if (me && typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(`player_${gameCode}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.teamId !== me.team_id) {
            // team情報を取得して更新
            if (me.team_id) {
              const { data: teamData } = await supabaseRef.current
                .from('teams')
                .select('team_name, team_color, team_emoji')
                .eq('id', me.team_id)
                .single();
              sessionStorage.setItem(`player_${gameCode}`, JSON.stringify({
                ...parsed,
                teamId: me.team_id,
                teamName: teamData?.team_name ?? null,
                teamColor: teamData?.team_color ?? null,
                teamEmoji: teamData?.team_emoji ?? null,
              }));
            } else {
              sessionStorage.setItem(`player_${gameCode}`, JSON.stringify({
                ...parsed,
                teamId: null, teamName: null, teamColor: null, teamEmoji: null,
              }));
            }
          }
        } catch {}
      }
    }
  }

  async function fetchTeams(sessionId: string) {
    const { data } = await supabaseRef.current
      .from('teams')
      .select('*')
      .eq('game_session_id', sessionId)
      .order('turn_order');
    setTeams(data ?? []);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-indigo-50 to-white dark:from-gray-950 dark:to-gray-900">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-indigo-50 to-white dark:from-gray-950 dark:to-gray-900">
        <div className="w-full max-w-md text-center">
          <p className="text-5xl">😞</p>
          <p className="mt-4 text-lg font-medium text-red-600">{error ?? 'エラーが発生しました'}</p>
          <a href="/" className="mt-6 inline-block rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700">トップに戻る</a>
        </div>
      </div>
    );
  }

  const isTeamForming = session.status === 'team_forming';
  const myPlayer = players.find((p) => p.id === myPlayerId);
  const myTeam = myPlayer?.team_id ? teams.find((t) => t.id === myPlayer.team_id) : null;

  // チーム戦ロビー
  if (isTeamForming) {
    // チームごとにプレイヤーをグループ化
    const teamGroups = teams.map((team) => ({
      ...team,
      members: players.filter((p) => p.team_id === team.id),
    }));

    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-white p-6 dark:from-gray-950 dark:to-gray-900">
        <div className="w-full max-w-lg space-y-6">
          {/* ヘッダー */}
          <div className="text-center">
            <p className="text-sm text-gray-500">
              {gameSet?.name ?? 'ゲーム'}
              {session.host_name && ` ・ ${session.host_name}先生`}
            </p>
            <h1 className="mt-1 text-2xl font-bold">👥 チーム戦モード</h1>
            <div className="mt-2 flex items-center justify-center gap-3 text-xs text-gray-500">
              <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-800">
                {session.progress_mode === 'turn_based' ? '🔄 ターン制' : '⚡ 同時プレイ'}
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-800">
                {session.answer_rule === 'anyone' ? '☁ 誰か1人dOK' : '🤝 全員一致'}
              </span>
            </div>
          </div>

          {/* 自分のチーム */}
          {myTeam && (
            <div className="rounded-2xl border-2 p-4 shadow-lg" style={{ borderColor: myTeam.team_color ?? '#6366F1', backgroundColor: (myTeam.team_color ?? '#6366F1') + '10' }}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-2xl">{myTeam.team_emoji ?? '👥'}</span>
                <span className="text-lg font-bold">{myTeam.team_name}</span>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">あなたのチーム</span>
              </div>
              <div className="space-y-1">
                {teamGroups.find((g) => g.id === myTeam.id)?.members.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-sm">
                    {p.id === myPlayerId ? (
                      <span className="font-bold text-indigo-600">⭐ {p.player_name}（あなた）</span>
                    ) : (
                      <span className="text-gray-700 dark:text-gray-300">{p.player_name}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 他のチーム */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-500">他のチーム</h3>
            {teamGroups
              .filter((g) => g.id !== myTeam?.id)
              .map((group) => (
                <div key={group.id} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{group.team_emoji ?? '👥'}</span>
                    <span className="font-medium">{group.team_name}</span>
                    <span className="text-xs text-gray-400">({group.members.length}人)</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {group.members.map((m) => m.player_name).join('、')}
                  </p>
                </div>
              ))}
          </div>

          {/* 待機メッセージ */}
          <div className="text-center">
            <p className="animate-pulse text-gray-500">先生の開始を待っています... 🕐</p>
          </div>
        </div>
      </main>
    );
  }

  // 個人戦ロビー（status: waiting）
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-white p-6 dark:from-gray-950 dark:to-gray-900">
      <div className="w-full max-w-md space-y-6">
        {/* ヘッダー */}
        <div className="text-center">
          <p className="text-sm text-gray-500">
            {gameSet?.name ?? 'ゲーム'}
            {session.host_name && ` ・ ${session.host_name}先生`}
          </p>
          <h1 className="mt-1 text-2xl font-bold">参加しました！ 🎉</h1>
          <p className="mt-1 text-xs text-gray-400">コード: {session.game_code}</p>
        </div>

        {/* 自分のカード */}
        <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-4 text-center shadow-lg dark:border-indigo-800 dark:bg-indigo-950">
          <p className="text-lg font-bold text-indigo-700 dark:text-indigo-300">
            ⭐ {myPlayerName ?? 'あなた'}
          </p>
        </div>

        {/* 参加者一覧 */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow dark:border-gray-800 dark:bg-gray-900">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
            参加者 ({players.length}人)
          </h3>
          <div className="flex flex-wrap gap-2">
            {players.map((p) => (
              <span
                key={p.id}
                className={`rounded-full px-3 py-1 text-sm ${
                  p.id === myPlayerId
                    ? 'bg-indigo-100 font-bold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                {p.id === myPlayerId ? `⭐ ${p.player_name}` : p.player_name}
              </span>
            ))}
          </div>
        </div>

        {/* 待機メッセージ */}
        <div className="text-center">
          <p className="animate-pulse text-gray-500">先生の開始を待っています... 🕐</p>
        </div>
      </div>
    </main>
  );
}
