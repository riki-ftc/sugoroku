'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type GameSet = {
  id: string;
  name: string;
  description: string | null;
  dice_sides: number;
  dice_count: number;
  answer_time_limit: number | null;
  created_at: string;
  cell_count?: number;
  quiz_count?: number;
  action_count?: number;
};

export default function AdminPage() {
  const [gameSets, setGameSets] = useState<GameSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGameSets();
  }, []);

  async function fetchGameSets() {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data, error: fetchError } = await supabase
      .from('game_sets')
      .select('*')
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError('ゲームセットの取得に失敗しました: ' + fetchError.message);
      setLoading(false);
      return;
    }

    // 各ゲームセットのマス数・問題数・アクション数を取得
    const enriched = await Promise.all(
      (data ?? []).map(async (gs) => {
        const [cellRes, quizRes, actionRes] = await Promise.all([
          supabase.from('cells').select('id', { count: 'exact', head: true }).eq('game_set_id', gs.id),
          supabase.from('quizzes').select('id', { count: 'exact', head: true }).eq('game_set_id', gs.id),
          supabase.from('actions').select('id', { count: 'exact', head: true }).eq('game_set_id', gs.id),
        ]);
        return {
          ...gs,
          cell_count: cellRes.count ?? 0,
          quiz_count: quizRes.count ?? 0,
          action_count: actionRes.count ?? 0,
        };
      })
    );

    setGameSets(enriched);
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">管理画面ホーム</h1>
        <a
          href="/admin/import"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          📥 Excelインポート
        </a>
      </div>

      {/* ゲームセット一覧 */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">ゲームセット一覧</h2>

        {loading && (
          <p className="text-sm text-gray-500">読み込み中...</p>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && gameSets.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
            <p className="text-gray-500">まだゲームセットがありません</p>
            <p className="mt-1 text-sm text-gray-400">
              「Excelインポート」からテンプレートをアップロードしてください
            </p>
          </div>
        )}

        {!loading && gameSets.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {gameSets.map((gs) => (
              <div
                key={gs.id}
                className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{gs.name}</h3>
                    {gs.description && (
                      <p className="mt-0.5 text-sm text-gray-500">{gs.description}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                    有効
                  </span>
                </div>

                <div className="mb-4 flex gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <span>🗺️ {gs.cell_count}マス</span>
                  <span>❓ {gs.quiz_count}問</span>
                  <span>⚡ {gs.action_count}アクション</span>
                </div>

                <div className="mb-3 text-xs text-gray-400">
                  🎲 {gs.dice_count}d{gs.dice_sides} ／ ⏱️ {gs.answer_time_limit ?? '∞'}秒
                </div>

                <div className="flex gap-2">
                  <a
                    href={`/admin/game-sets/${gs.id}`}
                    className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    詳細を見る
                  </a>
                  <a
                    href={`/admin/create-game?gameSetId=${gs.id}`}
                    className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                  >
                    🎮 ゲーム作成
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
