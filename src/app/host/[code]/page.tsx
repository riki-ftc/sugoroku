'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import QRCode from 'qrcode';

type GameSession = {
  id: string;
  game_code: string;
  game_set_id: string;
  host_name: string | null;
  status: 'waiting' | 'playing' | 'finished';
  current_turn_team_id: string | null;
  turn_number: number;
  max_teams: number;
  created_at: string;
  expires_at: string;
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
  current_position: number;
  joined_at: string;
};

const TEAM_COLORS = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
  '#14B8A6', '#6366F1', '#D946EF', '#84CC16',
];

const TEAM_EMOJIS = ['🐶', '🐱', '🐼', '🦊', '🐸', '🐧', '🦁', '🐻', '🐰', '🐲', '🦄', '🐨'];

export default function HostPage() {
  const params = useParams();
  const router = useRouter();
  const gameCode = params.code as string;

  const [session, setSession] = useState<GameSession | null>(null);
  const [gameSet, setGameSet] = useState<GameSet | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [starting, setStarting] = useState(false);

  const supabaseRef = useRef(createClient());

  useEffect(() => {
    fetchData();
  }, [gameCode]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const joinUrl = `${window.location.origin}/join/${gameCode}`;
      QRCode.toDataURL(joinUrl, {
        width: 300,
        margin: 2,
        color: { dark: '#1F2937', light: '#FFFFFF' },
      }).then(setQrDataUrl);
    }
  }, [gameCode]);

  useEffect(() => {
    if (!session) return;
    const supabase = supabaseRef.current;

    const channel = supabase
      .channel(`host:${gameCode}`)
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
          event: '*',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          const updated = payload.new as GameSession;
          setSession(updated);
          if (updated.status === 'playing') {
            router.push(`/play/${gameCode}?host=true`);
          }
          if (updated.status === 'finished') {
            router.push(`/results/${gameCode}`);
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
      setError('ゲームセッションが見つかりません。コードを確認してください。');
      setLoading(false);
      return;
    }

    // 終了済みゲームは結果ページへリダイレクト
    if (sessionData.status === 'finished') {
      router.push(`/results/${gameCode}`);
      return;
    }

    // プレイ中ゲームはプレイ画面へリダイレクト
    if (sessionData.status === 'playing') {
      router.push(`/play/${gameCode}?host=true`);
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
      .select('*')
      .eq('game_session_id', sessionId)
      .order('turn_order', { ascending: true });
    setTeams(data ?? []);
  }

  async function handleStart() {
    if (!session || teams.length < 2) return;
    setStarting(true);
    setError(null);

    const supabase = supabaseRef.current;
    const firstTeam = teams.sort((a, b) => (a.turn_order ?? 0) - (b.turn_order ?? 0))[0];

    const { error: updateErr } = await supabase
      .from('game_sessions')
      .update({
        status: 'playing',
        current_turn_team_id: firstTeam.id,
        turn_number: 1,
        started_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    if (updateErr) {
      setError('ゲーム開始に失敗しました: ' + updateErr.message);
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
          <a href="/admin" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            ← 管理画面に戻る
          </a>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join/${gameCode}`
    : `/join/${gameCode}`;

  const isExpired = new Date(session.expires_at) < new Date();

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white dark:from-gray-950 dark:to-gray-900">
      <header className="border-b border-gray-200 bg-white/80 px-6 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <a href="/admin" className="text-sm text-gray-500 hover:text-gray-700">
            ← 管理画面
          </a>
          <div className="text-sm text-gray-500">
            {gameSet?.name ?? 'ゲーム'} ・ {session.host_name ?? 'ホスト'}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isExpired && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            ⚠️ このゲームセッションは期限切れです。新しいゲームを作成してください。
          </div>
        )}

        <div className="grid gap-8 md:grid-cols-2">
          <div className="text-center">
            <div className="inline-block rounded-2xl bg-white p-6 shadow-lg dark:bg-gray-900">
              {qrDataUrl && (
                <img src={qrDataUrl} alt="QR Code" className="mx-auto h-64 w-64" />
              )}
              <p className="mt-3 text-sm text-gray-500">このQRコードを生徒に見せてください</p>
              <div className="mt-4 rounded-lg bg-gray-100 px-6 py-4 dark:bg-gray-800">
                <p className="text-xs text-gray-500">ゲームコード</p>
                <p className="font-mono text-3xl font-bold tracking-[0.3em] text-indigo-600">
                  {session.game_code}
                </p>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(joinUrl);
                  alert('参加URLをコピーしました');
                }}
                className="mt-3 rounded border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                📋 参加URLをコピー
              </button>
            </div>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                参加チーム（{teams.length}/{session.max_teams}）
              </h2>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                session.status === 'waiting'
                  ? 'bg-yellow-100 text-yellow-700'
                  : session.status === 'playing'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-700'
              }`}>
                {session.status === 'waiting' ? '参加受付中' :
                 session.status === 'playing' ? 'プレイ中' : '終了'}
              </span>
            </div>

            {teams.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
                <p className="text-2xl">🕐</p>
                <p className="mt-2 text-gray-500">生徒の参加を待っています...</p>
                <p className="mt-1 text-xs text-gray-400">
                  QRコードを読み取るか、コードを入力してもらってください
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {teams.map((team, idx) => (
                  <div
                    key={team.id}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900"
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
                      style={{ backgroundColor: team.team_color ?? TEAM_COLORS[idx % TEAM_COLORS.length] + '20' }}
                    >
                      {team.team_emoji ?? TEAM_EMOJIS[idx % TEAM_EMOJIS.length]}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{team.team_name}</p>
                      <p className="text-xs text-gray-400">
                        #{(team.turn_order ?? idx) + 1} ・ {new Date(team.joined_at).toLocaleTimeString('ja-JP')}
                      </p>
                    </div>
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: team.team_color ?? TEAM_COLORS[idx % TEAM_COLORS.length] }}
                    />
                  </div>
                ))}
              </div>
            )}

            {session.status === 'waiting' && (
              <button
                onClick={handleStart}
                disabled={teams.length < 2 || starting || isExpired}
                className="mt-6 w-full rounded-lg bg-green-600 px-6 py-4 text-lg font-bold text-white shadow-lg hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {starting
                  ? '開始中...'
                  : teams.length < 2
                  ? `あと${2 - teams.length}チーム参加が必要`
                  : '🚀 ゲーム開始！'}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}