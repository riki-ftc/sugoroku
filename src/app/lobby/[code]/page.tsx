'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type GameSession = {
  id: string;
  game_code: string;
  status: 'waiting' | 'playing' | 'finished';
  host_name: string | null;
  game_set_id: string;
};

type GameSet = {
  id: string;
  name: string;
};

type Team = {
  id: string;
  team_name: string;
  team_color: string | null;
  team_emoji: string | null;
  turn_order: number | null;
};

type MyTeamInfo = {
  teamId: string;
  teamName: string;
  teamColor: string;
  teamEmoji: string;
};

export default function LobbyPage() {
  const params = useParams();
  const router = useRouter();
  const gameCode = params.code as string;

  const [session, setSession] = useState<GameSession | null>(null);
  const [gameSet, setGameSet] = useState<GameSet | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [myTeam, setMyTeam] = useState<MyTeamInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dots, setDots] = useState('');

  const supabaseRef = useRef(createClient());

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(`team_${gameCode}`);
      if (stored) {
        setMyTeam(JSON.parse(stored));
      } else {
        router.push(`/join/${gameCode}`);
      }
    }
  }, [gameCode, router]);

  useEffect(() => {
    if (!myTeam) return;
    fetchData();
  }, [gameCode, myTeam]);

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 600);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!session) return;
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel(`lobby:${gameCode}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teams',
          filter: `game_session_id=eq.${session.id}`,
        },
        () => {
          fetchTeams(session.id);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          const updated = payload.new as GameSession;
          setSession(updated);
          if (updated.status === 'playing') {
            // ★ フルページロードでプレイ画面へ遷移（Realtime確実に初期化）
            window.location.href = `/play/${gameCode}`;
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id, gameCode, router]);

  async function fetchData() {
    setLoading(true);
    const supabase = supabaseRef.current;

    const { data: sessionData, error: sessionErr } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('game_code', gameCode)
      .single();

    if (sessionErr || !sessionData) {
      setError('ゲームセッションが見つかりません');
      setLoading(false);
      return;
    }

    if (sessionData.status === 'playing') {
      // ★ フルページロードで遷移
      window.location.href = `/play/${gameCode}`;
      return;
    }

    setSession(sessionData);

    const { data: gsData } = await supabase
      .from('game_sets')
      .select('id, name')
      .eq('id', sessionData.game_set_id)
      .single();
    setGameSet(gsData ?? null);

    await fetchTeams(sessionData.id);
    setLoading(false);
  }

  async function fetchTeams(sessionId: string) {
    const supabase = supabaseRef.current;
    const { data } = await supabase
      .from('teams')
      .select('id, team_name, team_color, team_emoji, turn_order')
      .eq('game_session_id', sessionId)
      .order('turn_order', { ascending: true });
    setTeams(data ?? []);
  }

  if (loading || !myTeam) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-indigo-50 to-white dark:from-gray-950 dark:to-gray-900">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-indigo-50 to-white dark:from-gray-950 dark:to-gray-900">
        <div className="w-full max-w-md text-center">
          <p className="text-lg font-medium text-red-600">{error}</p>
          <a
            href="/"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700"
          >
            トップに戻る
          </a>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-gradient-to-b from-indigo-50 to-white dark:from-gray-950 dark:to-gray-900">
      <div className="w-full max-w-md space-y-6 p-6">
        <div
          className="rounded-2xl border-2 p-6 text-center shadow-lg"
          style={{ borderColor: myTeam.teamColor, backgroundColor: myTeam.teamColor + '10' }}
        >
          <div
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl"
            style={{ backgroundColor: myTeam.teamColor + '30' }}
          >
            {myTeam.teamEmoji}
          </div>
          <h2 className="mt-3 text-2xl font-bold">{myTeam.teamName}</h2>
          <p className="mt-1 text-sm text-gray-500">参加済み</p>
        </div>

        <div className="rounded-xl bg-white p-6 text-center shadow-md dark:bg-gray-900">
          <div className="text-3xl">
            🎮
          </div>
          <h3 className="mt-2 text-lg font-semibold">
            ゲーム開始を待っています{dots}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            先生が「ゲーム開始」を押すまでお待ちください
          </p>
          {gameSet && (
            <p className="mt-2 text-xs text-gray-400">
              {gameSet.name}
              {session?.host_name && ` ・ ${session.host_name}先生`}
            </p>
          )}
        </div>

        <div>
          <h4 className="mb-3 text-sm font-medium text-gray-600 dark:text-gray-400">
            参加チーム（{teams.length}）
          </h4>
          <div className="space-y-2">
            {teams.map((team) => {
              const isMe = team.id === myTeam.teamId;
              return (
                <div
                  key={team.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${
                    isMe
                      ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950'
                      : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
                  }`}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
                    style={{ backgroundColor: (team.team_color ?? '#6366F1') + '25' }}
                  >
                    {team.team_emoji ?? '🎲'}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">
                      {team.team_name}
                      {isMe && (
                        <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-normal text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300">
                          あなた
                        </span>
                      )}
                    </p>
                  </div>
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: team.team_color ?? '#6366F1' }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-center text-xs text-gray-400">
          コード: {gameCode}
        </p>
      </div>
    </main>
  );
}
