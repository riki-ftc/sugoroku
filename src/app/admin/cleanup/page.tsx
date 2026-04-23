'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type DbSizeInfo = {
  used_bytes: number;
  limit_bytes: number;
  used_mb: number;
  limit_mb: number;
};

type GameSet = {
  id: string;
  name: string;
  description: string | null;
};

type DeleteResult = {
  success?: boolean;
  error?: string;
  name?: string;
  deleted_cells?: number;
  deleted_quizzes?: number;
  deleted_actions?: number;
};

export default function CleanupPage() {
  const [dbSize, setDbSize] = useState<DbSizeInfo | null>(null);
  const [gameSets, setGameSets] = useState<GameSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const supabase = createClient();

    const [sizeRes, gsRes] = await Promise.all([
      supabase.rpc('get_db_size_info'),
      supabase
        .from('game_sets')
        .select('id, name, description')
        .order('created_at', { ascending: false }),
    ]);

    if (sizeRes.data) setDbSize(sizeRes.data as DbSizeInfo);
    if (gsRes.data) setGameSets(gsRes.data);
    setLoading(false);
  }

  async function handleDeleteGameSet(id: string) {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }

    setDeleting(true);
    setMessage(null);
    setConfirmDeleteId(null);

    const supabase = createClient();
    const { data, error: err } = await supabase.rpc('delete_game_set', {
      target_game_set_id: id,
    });

    if (err) {
      setMessage({ type: 'error', text: '削除に失敗しました: ' + err.message });
    } else {
      const result = data as DeleteResult;
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({
          type: 'success',
          text: `「${result.name}」を削除しました（マス${result.deleted_cells}件・クイズ${result.deleted_quizzes}件・アクション${result.deleted_actions}件）`,
        });
        // 一覧とDB容量を再取得
        fetchData();
      }
    }

    setDeleting(false);
  }

  const usagePercent = dbSize ? Math.min((dbSize.used_mb / dbSize.limit_mb) * 100, 100) : 0;
  const barColor =
    usagePercent > 80 ? 'bg-red-500' : usagePercent > 50 ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <a href="/admin" className="text-sm text-blue-600 hover:underline">
          ← 管理画面
        </a>
        <h1 className="mt-1 text-2xl font-bold">データ管理・クリーンアップ</h1>
      </div>

      {/* メッセージ */}
      {message && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            message.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* DB容量 */}
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-3 text-lg font-semibold">Supabase DB容量</h2>
        {loading ? (
          <p className="text-sm text-gray-500">読み込み中...</p>
        ) : dbSize ? (
          <div>
            <div className="mb-2 flex items-end justify-between">
              <span className="text-2xl font-bold">{dbSize.used_mb} MB</span>
              <span className="text-sm text-gray-500">/ {dbSize.limit_mb} MB（無料枠）</span>
            </div>
            <div className="h-4 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">{usagePercent.toFixed(1)}% 使用中</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">容量情報を取得できませんでした</p>
        )}
      </section>

      {/* 自動クリーンアップ説明 */}
      <section className="rounded-lg border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-blue-950">
        <h2 className="font-semibold text-blue-800 dark:text-blue-200">🔄 自動クリーンアップ</h2>
        <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
          終了済みゲームのプレイ履歴（セッション・チーム・ターンイベント）は、終了から24時間後に自動削除されます。
          プレイ中・受付中のゲームは影響を受けません。
        </p>
      </section>

      {/* マスターデータ削除 */}
      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-1 text-lg font-semibold">ゲームセットの削除</h2>
        <p className="mb-4 text-sm text-gray-500">
          ゲームセットとその関連データ（マス・クイズ・アクション・プレイ履歴）をすべて削除します。
        </p>

        {loading ? (
          <p className="text-sm text-gray-500">読み込み中...</p>
        ) : gameSets.length === 0 ? (
          <p className="text-sm text-gray-400">ゲームセットはありません。</p>
        ) : (
          <div className="space-y-3">
            {gameSets.map((gs) => (
              <div
                key={gs.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-950"
              >
                <div>
                  <p className="font-medium">{gs.name}</p>
                  {gs.description && (
                    <p className="text-xs text-gray-500">{gs.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteGameSet(gs.id)}
                  disabled={deleting}
                  className={`shrink-0 rounded px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 ${
                    confirmDeleteId === gs.id
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-gray-400 hover:bg-gray-500'
                  }`}
                >
                  {confirmDeleteId === gs.id ? '本当に削除する' : '削除'}
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          ⚠️ プレイ中・受付中のゲームがあるゲームセットは削除できません。削除は元に戻せません。
        </div>
      </section>
    </div>
  );
}
