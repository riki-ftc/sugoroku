'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type GameSession = {
  id: string;
  game_code: string;
  game_set_id: string;
  host_name: string | null;
  status: 'waiting' | 'playing' | 'finished';
  max_teams: number;
  expires_at: string;
};

type GameSet = {
  id: string;
  name: string;
};

const TEAM_COLORS = [
  { value: '#EF4444', label: '赤', bg: 'bg-red-500' },
  { value: '#F59E0B', label: 'オレンジ', bg: 'bg-amber-500' },
  { value: '#10B981', label: '緑', bg: 'bg-emerald-500' },
  { value: '#3B82F6', label: '青', bg: 'bg-blue-500' },
  { value: '#8B5CF6', label: '紫', bg: 'bg-violet-500' },
  { value: '#EC4899', label: 'ピンク', bg: 'bg-pink-500' },
  { value: '#06B6D4', label: '水色', bg: 'bg-cyan-500' },
  { value: '#F97316', label: '橙', bg: 'bg-orange-500' },
];

const TEAM_EMOJIS = [
  { value: '🐶', label: '犬' },
  { value: '🐱', label: '猫' },
  { value: '🐼', label: 'パンダ' },
  { value: '🦊', label: 'キツネ' },
  { value: '🐸', label: 'カエル' },
  { value: '🐧', label: 'ペンギン' },
  { value: '🦁', label: 'ライオン' },
  { value: '🐻', label: 'クマ' },
  { value: '🐰', label: 'ウサギ' },
  { value: '🐲', label: 'ドラゴン' },
  { value: '🦄', label: 'ユニコーン' },
  { value: '🐨', label: 'コアラ' },
];

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const gameCode = params.code as string;

  const [session, setSession] = useState<GameSession | null>(null);
  const [gameSet, setGameSet] = useState<GameSet | null>(null);
  const [existingTeams, setExistingTeams] = useState<string[]>([]);
  const [teamCount, setTeamCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  // フォームステート
  const [teamName, setTeamName] = useState('');
  const [selectedColor, setSelectedColor] = useState(TEAM_COLORS[0].value);
  const [selectedEmoji, setSelectedEmoji] = useState(TEAM_EMOJIS[0].value);

  const supabaseRef = useRef(createClient());

  // セッション情報取得
  useEffect(() => {
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

    if (sessionData.status !== 'waiting') {
      setError(
        sessionData.status === 'playing'
          ? 'このゲームは既に始まっています。'
          : 'このゲームは終了しています。'
      );
      setLoading(false);
      return;
    }

    if (new Date(sessionData.expires_at) < new Date()) {
      setError('このゲームは期限切れです。');
      setLoading(false);
      return;
    }

    setSession(sessionData);

    // ゲームセット名を取得
    const { data: gsData } = await supabase
      .from('game_sets')
      .select('id, name')
      .eq('id', sessionData.game_set_id)
      .single();
    setGameSet(gsData ?? null);

    // 既存チーム名を取得（重複チェック用）
    const { data: teamsData } = await supabase
      .from('teams')
      .select('team_name')
      .eq('game_session_id', sessionData.id);
    setExistingTeams((teamsData ?? []).map((t) => t.team_name));
    setTeamCount(teamsData?.length ?? 0);

    setLoading(false);
  }

  async function handleJoin() {
    if (!session) return;
    const trimmed = teamName.trim();

    // バリデーション
    if (!trimmed) {
      setError('チーム名を入力してください');
      return;
    }
    if (trimmed.length > 20) {
      setError('チーム名は20文字以内にしてください');
      return;
    }
    if (existingTeams.includes(trimmed)) {
      setError('そのチーム名は既に使われています');
      return;
    }
    if (teamCount >= session.max_teams) {
      setError(`参加上限（${session.max_teams}チーム）に達しています`);
      return;
    }

    setJoining(true);
    setError(null);

    const supabase = supabaseRef.current;

    const { data: newTeam, error: insertErr } = await supabase
      .from('teams')
      .insert({
        game_session_id: session.id,
        team_name: trimmed,
        team_color: selectedColor,
        team_emoji: selectedEmoji,
        turn_order: teamCount, // 参加順
        current_position: 0,
      })
      .select('id')
      .single();

    if (insertErr || !newTeam) {
      if (insertErr?.code === '23505') {
        setError('そのチーム名は既に使われています');
      } else {
        setError('参加に失敗しました: ' + (insertErr?.message ?? '不明なエラー'));
      }
      setJoining(false);
      return;
    }

    // チームIDをlocalStorageに保存（ロビー・ゲーム画面で使用）
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`team_${gameCode}`, JSON.stringify({
        teamId: newTeam.id,
        teamName: trimmed,
        teamColor: selectedColor,
        teamEmoji: selectedEmoji,
      }));
    }

    // ロビー画面へ
    router.push(`/lobby/${gameCode}`);
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-white p-6 dark:from-gray-950 dark:to-gray-900">
      <div className="w-full max-w-md space-y-6">
        {/* ヘッダー */}
        <div className="text-center">
          <p className="text-sm text-gray-500">
            {gameSet?.name ?? 'ゲーム'}
            {session.host_name && ` ・ ${session.host_name}先生`}
          </p>
          <h1 className="mt-1 text-2xl font-bold">チームをつくろう！</h1>
          <p className="mt-1 text-xs text-gray-400">
            コード: {session.game_code}
          </p>
        </div>

        {/* フォーム */}
        <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900">
          {/* チーム名 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              チーム名
            </label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => {
                setTeamName(e.target.value);
                setError(null);
              }}
              placeholder="例：チームロケット🚀"
              maxLength={20}
              className="w-full rounded-lg border-2 border-gray-300 bg-gray-50 px-4 py-3 text-lg font-medium transition-colors focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              autoComplete="off"
            />
            <p className="mt-1 text-right text-xs text-gray-400">
              {teamName.length}/20
            </p>
          </div>

          {/* アイコン（絵文字）選択 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              アイコン
            </label>
            <div className="grid grid-cols-6 gap-2">
              {TEAM_EMOJIS.map((emoji) => (
                <button
                  key={emoji.value}
                  onClick={() => setSelectedEmoji(emoji.value)}
                  className={`flex h-12 w-full items-center justify-center rounded-lg text-2xl transition-all ${
                    selectedEmoji === emoji.value
                      ? 'bg-indigo-100 ring-2 ring-indigo-500 dark:bg-indigo-900'
                      : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700'
                  }`}
                  title={emoji.label}
                >
                  {emoji.value}
                </button>
              ))}
            </div>
          </div>

          {/* カラー選択 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              チームカラー
            </label>
            <div className="grid grid-cols-8 gap-2">
              {TEAM_COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => setSelectedColor(color.value)}
                  className={`h-10 w-full rounded-full transition-all ${
                    selectedColor === color.value
                      ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white scale-110'
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.label}
                />
              ))}
            </div>
          </div>

          {/* プレビュー */}
          <div className="flex items-center justify-center gap-3 rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full text-2xl"
              style={{ backgroundColor: selectedColor + '30' }}
            >
              {selectedEmoji}
            </div>
            <div className="text-left">
              <p className="text-lg font-bold">{teamName || 'チーム名未入力'}</p>
              <p className="text-xs text-gray-500">このアイコンで参加します</p>
            </div>
          </div>

          {error && (
            <p className="text-center text-sm text-red-600">{error}</p>
          )}

          <button
            onClick={handleJoin}
            disabled={!teamName.trim() || joining}
            className="w-full rounded-xl bg-indigo-600 px-6 py-4 text-lg font-bold text-white shadow-md transition-all hover:bg-indigo-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {joining ? '参加中...' : 'このチームで参加する！'}
          </button>
        </div>

        {/* チーム数表示 */}
        <p className="text-center text-xs text-gray-400">
          現在 {teamCount}/{session.max_teams} チームが参加中
        </p>
      </div>
    </main>
  );
}
