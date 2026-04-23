'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type GameSet = {
  id: string;
  name: string;
  description: string | null;
  dice_sides: number;
  dice_count: number;
  answer_time_limit: number | null;
  created_at: string;
};

type Cell = {
  id: string;
  cell_number: number;
  cell_type: string;
  label: string | null;
  quiz_id: string | null;
  correct_action_id: string | null;
  wrong_action_id: string | null;
  memo: string | null;
};

type Quiz = {
  id: string;
  quiz_code: string;
  category: string | null;
  difficulty: string | null;
  question: string;
  choice_a: string;
  choice_b: string;
  choice_c: string | null;
  choice_d: string | null;
  answer: string;
  explanation: string | null;
};

type Action = {
  id: string;
  action_code: string;
  action_type: string;
  value: number;
  message: string | null;
};

type Tab = 'cells' | 'quizzes' | 'actions';

export default function GameSetDetailPage() {
  const params = useParams();
  const gameSetId = params.id as string;

  const [gameSet, setGameSet] = useState<GameSet | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('cells');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [gameSetId]);

  async function fetchData() {
    setLoading(true);
    const supabase = createClient();

    const [gsRes, cellRes, quizRes, actionRes] = await Promise.all([
      supabase.from('game_sets').select('*').eq('id', gameSetId).single(),
      supabase.from('cells').select('*').eq('game_set_id', gameSetId).order('cell_number'),
      supabase.from('quizzes').select('*').eq('game_set_id', gameSetId).order('quiz_code'),
      supabase.from('actions').select('*').eq('game_set_id', gameSetId).order('action_code'),
    ]);

    if (gsRes.error) {
      setError('ゲームセットが見つかりません');
      setLoading(false);
      return;
    }

    setGameSet(gsRes.data);
    setCells(cellRes.data ?? []);
    setQuizzes(quizRes.data ?? []);
    setActions(actionRes.data ?? []);
    setLoading(false);
  }

  const cellTypeEmoji: Record<string, string> = {
    スタート: '🏁',
    通常: '❓',
    イベント: '⭐',
    ボーナス: '🎁',
    ゴール: '🏆',
  };

  if (loading) return <p className="text-gray-500">読み込み中...</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!gameSet) return null;

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'cells', label: '🗺️ マス設定', count: cells.length },
    { key: 'quizzes', label: '❓ 問題', count: quizzes.length },
    { key: 'actions', label: '⚡ アクション', count: actions.length },
  ];

  // quiz_id → quiz_code のマップ
  const quizMap = new Map(quizzes.map((q) => [q.id, q.quiz_code]));
  const actionMap = new Map(actions.map((a) => [a.id, a.action_code]));

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div>
          <a href="/admin" className="text-sm text-blue-600 hover:underline">
            ← ゲームセット一覧
          </a>
          <h1 className="mt-1 text-2xl font-bold">{gameSet.name}</h1>
          {gameSet.description && (
            <p className="mt-1 text-gray-500">{gameSet.description}</p>
          )}
          <div className="mt-2 flex gap-4 text-sm text-gray-500">
            <span>🎲 {gameSet.dice_count}d{gameSet.dice_sides}</span>
            <span>⏱️ {gameSet.answer_time_limit ?? '∞'}秒</span>
            <span>作成: {new Date(gameSet.created_at).toLocaleDateString('ja-JP')}</span>
          </div>
        </div>
        <a
          href={`/admin/create-game?gameSetId=${gameSet.id}`}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          🎮 このセットでゲーム作成
        </a>
      </div>

      {/* タブ */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* マス設定タブ */}
      {activeTab === 'cells' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="px-3 py-2 text-left">No.</th>
                <th className="px-3 py-2 text-left">種別</th>
                <th className="px-3 py-2 text-left">表示テキスト</th>
                <th className="px-3 py-2 text-left">問題ID</th>
                <th className="px-3 py-2 text-left">正解時</th>
                <th className="px-3 py-2 text-left">不正解時</th>
                <th className="px-3 py-2 text-left">メモ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {cells.map((cell) => (
                <tr key={cell.id} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                  <td className="px-3 py-2 font-mono">{cell.cell_number}</td>
                  <td className="px-3 py-2">
                    {cellTypeEmoji[cell.cell_type] ?? '❔'} {cell.cell_type}
                  </td>
                  <td className="px-3 py-2">{cell.label ?? '-'}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {cell.quiz_id ? quizMap.get(cell.quiz_id) ?? '-' : '-'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {cell.correct_action_id ? actionMap.get(cell.correct_action_id) ?? '-' : '-'}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {cell.wrong_action_id ? actionMap.get(cell.wrong_action_id) ?? '-' : '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-400">{cell.memo ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 問題タブ */}
      {activeTab === 'quizzes' && (
        <div className="space-y-3">
          {quizzes.map((q) => (
            <div
              key={q.id}
              className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs dark:bg-gray-800">
                  {q.quiz_code}
                </span>
                {q.category && (
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                    {q.category}
                  </span>
                )}
                {q.difficulty && (
                  <span className={`rounded px-2 py-0.5 text-xs ${
                    q.difficulty === '易' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                    q.difficulty === '中' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                    'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                  }`}>
                    {q.difficulty}
                  </span>
                )}
              </div>
              <p className="mb-2 font-medium">{q.question}</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                  const key = `choice_${letter.toLowerCase()}` as keyof Quiz;
                  const val = q[key] as string | null;
                  if (!val) return null;
                  const isCorrect = q.answer === letter;
                  return (
                    <div
                      key={letter}
                      className={`rounded px-3 py-1.5 ${
                        isCorrect
                          ? 'bg-green-100 font-medium text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {letter}. {val} {isCorrect && '✅'}
                    </div>
                  );
                })}
              </div>
              {q.explanation && (
                <p className="mt-2 text-xs text-gray-500">💡 {q.explanation}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* アクションタブ */}
      {activeTab === 'actions' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">タイプ</th>
                <th className="px-3 py-2 text-left">値</th>
                <th className="px-3 py-2 text-left">表示メッセージ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {actions.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                  <td className="px-3 py-2 font-mono text-xs">{a.action_code}</td>
                  <td className="px-3 py-2">{a.action_type}</td>
                  <td className="px-3 py-2">{a.value}</td>
                  <td className="px-3 py-2">{a.message ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
