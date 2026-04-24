'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type GameSession = {
  id: string;
  game_code: string;
  game_set_id: string;
  host_name: string | null;
  status: 'waiting' | 'team_forming' | 'playing' | 'finished';
  max_players: number;
  expires_at: string;
};

type GameSet = {
  id: string;
  name: string;
};

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const gameCode = params.code as string;

  const [session, setSession] = useState<GameSession | null>(null);
  const [gameSet, setGameSet] = useState<GameSet | null>(null);
  const [playerCount, setPlayerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [playerName, setPlayerName] = useState('');

  const supabaseRef = useRef(createClient());

  useEffect(() => {
    // 既に参加済みならロビーへ
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(`player_${gameCode}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.playerId) {
            router.push(`/lobby/${gameCode}`);
            return;
          }
        } catch {}
      }
    }
    fetchSession();
  }, [gameCode]);

  async function fetchSession() {
    setLoading(true);
    const supabase = supabaseRef.current;

    const { data: sessionData, error: sessionErr } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('game_code', gameCode)
      .single();

    if (sessionErr || !sessionData) {
      setError('ゲームが見つかりません。コードを確認してください。');
      setLoading(false);
      return;
    }

    if (sessionData.status === 'team_forming') {
      setError('チーム編成中です。先生に伝えてください。');
      setLoading(false);
      return;
    }

    if (sessionData.status === 'playing') {
      // ゲーム中は観戦として参加可能
      setSession(sessionData);
      setLoading(false);
      return;
    }

    if (sessionData.status === 'finished') {
      setError('このゲームは終了しています。');
      setLoading(false);
      return;
    }

    if (new Date(sessionData.expires_at) < new Date()) {
      setError('このゲームは期限切れです。');
      setLoading(false);
      return;
    }

    setSession(sessionData);

    const { data: gsData } = await supabase
      .from('game_sets')
      .select('id, name')
      .eq('id', sessionData.game_set_id)
      .single();
    setGameSet(gsData ?? null);

    const { count } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('game_session_id', sessionData.id);
    setPlayerCount(count ?? 0);

    setLoading(false);
  }

  async function handleJoin() {
    if (!session) return;
    const trimmed = playerName.trim();

    if (!trimmed) {
      setError('名前を入力してください');
      return;
    }
    if (trimmed.length > 20) {
      setError('名前は20文字以内にしてください');
      return;
    }
    if (playerCount >= (session.max_players ?? 100)) {
      setError('参加上限に達しています');
      return;
    }

    setJoining(true);
    setError(null);

    const supabase = supabaseRef.current;
    const isSpectator = session.status === 'playing';

    const { data: newPlayer, error: insertErr } = await supabase
      .from('players')
      .insert({
        game_session_id: session.id,
        player_name: trimmed,
        is_spectator: isSpectator,
      })
      .select('id')
      .single();

    if (insertErr || !newPlayer) {
      if (insertErr?.code === '23505') {
        setError('その名前は既に使われています');
      } else {
        setError('参加に失敗しました: ' + (insertErr?.message ?? '不明なエラー'));
      }
      setJoining(false);
      return;
    }

    // sessionStorageに保存
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`player_${gameCode}`, JSON.stringify({
        playerId: newPlayer.id,
        playerName: trimmed,
        teamId: null,
        teamName: null,
        teamColor: null,
        teamEmoji: null,
      }));
    }

    if (isSpectator) {
      // ゲーム中は直接プレイ画面へ（観戦モード）
      window.location.href = `/play/${gameCode}`;
    } else {
      router.push(`/lobby/${gameCode}`);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-indigo-50 to-white dark:from-gray-950 dark:to-gray-900">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if ((error && !session) || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-indigo-50 to-white dark:from-gray-950 dark:to-gray-900">
        <div className="w-full max-w-md text-center">
          <p className="text-5xl">😞</p>
          <p className="mt-4 text-lg font-medium text-red-600">{error}</p>
          <a href="/" className="mt-6 inline-block rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700">
            トップに戻る
          </a>
        </div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-white p-6 dark:from-gray-950 dark:to-gray-900">
      <div className="w-full max-w-md space-y-6">
        {/* ヘッダー */}
        <div className="text-center">
          <p className="text-sm text-gray-500">
            {gameSet?.name ?? 'ゲーム'}
            {session.host_name && ` ・ ${session.host_name}先生`}
          </p>
          <h1 className="mt-1 text-2xl font-bold">
            {session.status === 'playing' ? '観戦で参加する' : '参加する！'}
          </h1>
          <p className="mt-1 text-xs text-gray-400">コード: {session.game_code}</p>
        </div>

        {/* フォーム */}
        <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900">
          {session.status === 'playing' && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              ⚠️ ゲームは既に始まっています。観戦者として参加します。次のラウンドから正式参加できます。
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              名前
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => {
                setPlayerName(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && playerName.trim()) handleJoin();
              }}
              placeholder="例：たろう"
              maxLength={20}
              className="w-full rounded-lg border-2 border-gray-300 bg-gray-50 px-4 py-3 text-lg font-medium transition-colors focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              autoComplete="off"
              autoFocus
            />
            <p className="mt-1 text-right text-xs text-gray-400">
              {playerName.length}/20
            </p>
          </div>

          {error && (
            <p className="text-center text-sm text-red-600">{error}</p>
          )}

          <button
            onClick={handleJoin}
            disabled={!playerName.trim() || joining}
            className="w-full rounded-xl bg-indigo-600 px-6 py-4 text-lg font-bold text-white shadow-md transition-all hover:bg-indigo-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {joining ? '参加中...' : session.status === 'playing' ? '観戦で参加する' : '参加する！'}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400">
          現在 {playerCount}人が参加中
        </p>
      </div>
    </main>
  );
}
