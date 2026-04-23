'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type CleanupResult = {
  deleted_sessions: number;
  deleted_teams: number;
  deleted_turn_events: number;
  cutoff_date: string;
};

export default function CleanupPage() {
  const [daysOld, setDaysOld] = useState(30);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function handleCleanup() {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }

    setRunning(true);
    setError(null);
    setResult(null);

    const supabase = createClient();
    const { data, error: err } = await supabase.rpc('cleanup_old_games', {
      days_old: daysOld,
    });

    if (err) {
      setError('クリーンアップに失敗しました: ' + err.message);
    } else {
      setResult(data as CleanupResult);
    }

    setRunning(false);
    setConfirmed(false);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <a href="/admin" className="text-sm text-blue-600 hover:underline">
          ← 管理画面
        </a>
        <h1 className="mt-1 text-2xl font-bold">データクリーンアップ</h1>
        <p className="mt-1 text-sm text-gray-500">
          終了済みゲームの古いデータ（セッション・チーム・ターンイベント）を削除します。
          ゲームセットやマスター（問題・マス・アクション）は削除されません。
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
          <p className="font-semibold text-green-800 dark:text-green-200">✅ クリーンアップ完了</p>
          <div className="mt-2 space-y-1 text-sm text-green-700 dark:text-green-300">
            <p>削除したセッション: {result.deleted_sessions}件</p>
            <p>削除したチーム: {result.deleted_teams}件</p>
            <p>削除したターンイベント: {result.deleted_turn_events}件</p>
          </div>
          {result.deleted_sessions === 0 && (
            <p className="mt-2 text-sm text-gray-500">対象のデータはありませんでした。</p>
          )}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">削除対象</label>
          <div className="flex items-center gap-2">
            <select
              value={daysOld}
              onChange={(e) => {
                setDaysOld(Number(e.target.value));
                setConfirmed(false);
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <option value={7}>7日</option>
              <option value={14}>14日</option>
              <option value={30}>30日</option>
              <option value={60}>60日</option>
              <option value={90}>90日</option>
            </select>
            <span className="text-sm text-gray-600 dark:text-gray-400">以上前に終了したゲーム</span>
          </div>
        </div>

        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          ⚠️ 削除されたデータは元に戻せません。プレイ中・受付中のゲームは影響を受けません。
        </div>

        <button
          onClick={handleCleanup}
          disabled={running}
          className={`w-full rounded-lg px-6 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
            confirmed
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-orange-500 hover:bg-orange-600'
          }`}
        >
          {running
            ? '削除中...'
            : confirmed
            ? '⚠️ 本当に削除する（もう一度クリック）'
            : '🗑️ クリーンアップ実行'}
        </button>
      </div>
    </div>
  );
}
