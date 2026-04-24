'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

type GameSet = {
  id: string;
  name: string;
  description: string | null;
  dice_sides: number;
  dice_count: number;
};

type CreatedGame = {
  id: string;
  game_code: string;
};

function CreateGameContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const preselectedId = searchParams.get('gameSetId');

  const [gameSets, setGameSets] = useState<GameSet[]>([]);
  const [selectedId, setSelectedId] = useState<string>(preselectedId ?? '');
  const [hostName, setHostName] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedGame | null>(null);

  useEffect(() => { fetchGameSets(); }, []);

  async function fetchGameSets() {
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from('game_sets')
      .select('id, name, description, dice_sides, dice_count')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (err) { setError('ゲームセットの取得に失敗しました'); }
    else { setGameSets(data ?? []); if (!selectedId && data && data.length > 0) setSelectedId(data[0].id); }
    setLoading(false);
  }

  async function handleCreate() {
    if (!selectedId) return;
    setCreating(true);
    setError(null);
    const supabase = createClient();

    const { data: codeData, error: codeErr } = await supabase.rpc('generate_game_code');
    if (codeErr || !codeData) { setError('ゲームコードの生成に失敗しました'); setCreating(false); return; }
    const gameCode = codeData as string;

    const { data: session, error: sessionErr } = await supabase
      .from('game_sessions')
      .insert({
        game_code: gameCode,
        game_set_id: selectedId,
        host_name: hostName || null,
        status: 'waiting',
        play_mode: 'individual',
        progress_mode: 'simultaneous',
        answer_rule: 'anyone',
        max_players: 100,
        team_count: 4,
      })
      .select('id, game_code')
      .single();

    if (sessionErr || !session) { setError('ゲーム作成に失敗しました: ' + (sessionErr?.message ?? '')); setCreating(false); return; }
    setCreated(session);
    setCreating(false);
  }

  if (loading) return <p className="text-gray-500">読み込み中...</p>;

  if (created) {
    return (
      <div className="mx-auto max-w-lg space-y-6 text-center">
        <div className="rounded-lg border border-green-200 bg-green-50 p-8 dark:border-green-900 dark:bg-green-950">
          <p className="text-lg font-semibold text-green-800 dark:text-green-200">✅ ゲームが作成されました！</p>
          <div className="mt-4 rounded-lg bg-white p-6 dark:bg-gray-900">
            <p className="text-sm text-gray-500">ゲームコード</p>
            <p className="mt-1 font-mono text-4xl font-bold tracking-[0.3em] text-indigo-600">{created.game_code}</p>
          </div>
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
            ホスト画面でQRコードを表示し、生徒に参加してもらってください。
            個人戦/チーム戦の選択はホスト画面で行えます。
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <a href={`/host/${created.game_code}`} className="rounded-lg bg-indigo-600 px-6 py-3 text-center font-medium text-white hover:bg-indigo-700">📺 ホスト画面を開く</a>
          <button onClick={() => navigator.clipboard?.writeText(created.game_code)} className="rounded-lg border border-gray-300 px-6 py-3 text-sm font-medium hover:bg-gray-50 dark:border-gray-700">📋 コードをコピー</button>
          <button onClick={() => { setCreated(null); setSelectedId(preselectedId ?? gameSets[0]?.id ?? ''); }} className="text-sm text-gray-500 hover:underline">別のゲームを作成する</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <a href="/admin" className="text-sm text-blue-600 hover:underline">← 管理画面</a>
        <h1 className="mt-1 text-2xl font-bold">ゲーム作成</h1>
        <p className="mt-1 text-sm text-gray-500">ゲームセットを選んでゲームコードを発行します。個人戦/チーム戦はホスト画面で選べます。</p>
      </div>

      {error && (<div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>)}

      {gameSets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
          <p className="text-gray-500">ゲームセットがありません</p>
          <a href="/admin/import" className="mt-2 inline-block text-sm text-blue-600 hover:underline">まずはExcelインポートしてください →</a>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium">ゲームセット</label>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              {gameSets.map((gs) => (<option key={gs.id} value={gs.id}>{gs.name}（{gs.dice_count}d{gs.dice_sides}）</option>))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">先生の名前（任意）</label>
            <input type="text" value={hostName} onChange={(e) => setHostName(e.target.value)} placeholder="例：田中先生"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          </div>
          <button onClick={handleCreate} disabled={creating || !selectedId}
            className="w-full rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
            {creating ? '作成中...' : '🎲 ゲームコードを発行する'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function CreateGamePage() {
  return (<Suspense fallback={<p className="text-gray-500">読み込み中...</p>}><CreateGameContent /></Suspense>);
}
