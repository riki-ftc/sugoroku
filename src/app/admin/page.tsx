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

type GameSessionSummary = {
  id: string;
  game_code: string;
  game_set_id: string;
  game_set_name: string;
  host_name: string | null;
  status: string;
  turn_number: number;
  team_count: number;
  created_at: string;
  finished_at: string | null;
};

export default function AdminPage() {
  const [gameSets, setGameSets] = useState<GameSet[]>([]);
  const [recentGames, setRecentGames] = useState<GameSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    // ゲームセット取得
    const { data: gsData, error: gsErr } = await supabase
      .from('game_sets')
      .select('*')
      .order('created_at', { ascending: false });

    if (gsErr) {
      setError('ゲームセットの取得に失敗しました: ' + gsErr.message);
      setLoading(false);
      return;
    }

    const enriched = await Promise.all(
      (gsData ?? []).map(async (gs) => {
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

    // 最近のゲームセッション取得（最新10件）
    const { data: sessData } = await supabase
      .from('game_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (sessData && sessData.length > 0) {
      const sessions: GameSessionSummary[] = await Promise.all(
        sessData.map(async (sess: any) => {
          const gs = enriched.find((g) => g.id === sess.game_set_id);
          const { count } = await supabase
            .from('teams')
            .select('id', { count: 'exact', head: true })
            .eq('game_session_id', sess.id);
          return {
            id: sess.id,
            game_code: sess.game_code,
            game_set_id: sess.game_set_id,
            game_set_name: gs?.name ?? '不明',
            host_name: sess.host_name,
            status: sess.status,
            turn_number: sess.turn_number,
            team_count: count ?? 0,
            created_at: sess.created_at,
            finished_at: sess.finished_at,
          };
        })
      );
      setRecentGames(sessions);
    }

    setLoading(false);
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function statusBadge(status: string) {
    switch (status) {
      case 'waiting':
        return <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">受付中</span>;
      case 'playing':
        return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 animate-pulse">プレイ中</span>;
      case 'finished':
        return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">終了</span>;
      default:
        return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{status}</span>;
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">管理画面ホーム</h1>
        <div className="flex gap-2">
          <a
            href="/template/すごろくマスター管理テンプレート.xlsx"
            download
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            📄 テンプレートDL
          </a>
          <a
            href="/admin/import"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            📥 Excelインポート
          </a>
        </div>
      </div>

      {/* ゲームセット一覧 */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">ゲームセット一覧</h2>

        {loading && <p className="text-sm text-gray-500">読み込み中...</p>}

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
            <a
              href="/template/すごろくマスター管理テンプレート.xlsx"
              download
              className="mt-3 inline-block text-sm text-blue-600 hover:underline"
            >
              📄 テンプレートをダウンロード
            </a>
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

      {/* 最近のゲーム履歴 */}
      {!loading && recentGames.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">最近のゲーム</h2>
          <div className="space-y-2">
            {recentGames.map((game) => (
              <div
                key={game.id}
                className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-indigo-600">{game.game_code}</span>
                    {statusBadge(game.status)}
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                    {game.game_set_name}
                    {game.host_name && ` ・ ${game.host_name}`}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatDate(game.created_at)} ・ {game.team_count}チーム ・ {game.turn_number}ターン
                  </p>
                </div>
                <div className="flex gap-2">
                  {game.status === 'waiting' && (
                    <a
                      href={`/host/${game.game_code}`}
                      className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
                    >
                      ホスト画面
                    </a>
                  )}
                  {game.status === 'playing' && (
                    <a
                      href={`/play/${game.game_code}?host=true`}
                      className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                    >
                      ▶ 再参加
                    </a>
                  )}
                  {game.status === 'finished' && (
                    <a
                      href={`/results/${game.game_code}`}
                      className="rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
                    >
                      🏆 結果
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
