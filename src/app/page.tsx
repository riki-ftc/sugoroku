'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function HomePage() {
  const router = useRouter();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  function handleChange(index: number, value: string) {
    // 英数字のみ、大文字に変換
    const char = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-1);
    const newCode = [...code];
    newCode[index] = char;
    setCode(newCode);
    setError(null);

    // 次の入力欄にフォーカス
    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') {
      handleSubmit();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const newCode = [...code];
    for (let i = 0; i < pasted.length; i++) {
      newCode[i] = pasted[i];
    }
    setCode(newCode);
    // 最後の入力済みフィールドの次にフォーカス
    const nextIndex = Math.min(pasted.length, 5);
    inputRefs.current[nextIndex]?.focus();
  }

  async function handleSubmit() {
    const gameCode = code.join('');
    if (gameCode.length !== 6) {
      setError('6桁のコードを入力してください');
      return;
    }

    setChecking(true);
    setError(null);

    const supabase = createClient();
    const { data, error: fetchErr } = await supabase
      .from('game_sessions')
      .select('game_code, status, expires_at')
      .eq('game_code', gameCode)
      .single();

    if (fetchErr || !data) {
      setError('このコードのゲームが見つかりません');
      setChecking(false);
      return;
    }

    if (data.status === 'finished') {
      setError('このゲームは既に終了しています');
      setChecking(false);
      return;
    }

    if (new Date(data.expires_at) < new Date()) {
      setError('このゲームは期限切れです');
      setChecking(false);
      return;
    }

    if (data.status === 'playing') {
      setError('このゲームは既に開始されています');
      setChecking(false);
      return;
    }

    // 有効なゲーム → 参加画面へ
    router.push(`/join/${gameCode}`);
  }

  const isComplete = code.every((c) => c.length === 1);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-indigo-50 to-white p-6 dark:from-gray-950 dark:to-gray-900">
      <div className="w-full max-w-md space-y-8 text-center">
        {/* タイトル */}
        <div>
          <h1 className="text-5xl font-bold tracking-tight">🎲</h1>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">クイズすごろく</h2>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            先生から教えてもらったコードを入力してね
          </p>
        </div>

        {/* コード入力 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lg dark:border-gray-800 dark:bg-gray-900">
          <p className="mb-4 text-sm font-medium text-gray-600 dark:text-gray-400">
            ゲームコード
          </p>
          <div className="flex justify-center gap-2">
            {code.map((char, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="text"
                maxLength={1}
                value={char}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={i === 0 ? handlePaste : undefined}
                className="h-14 w-12 rounded-lg border-2 border-gray-300 bg-gray-50 text-center font-mono text-2xl font-bold uppercase text-gray-900 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-indigo-400"
                autoComplete="off"
              />
            ))}
          </div>

          {error && (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!isComplete || checking}
            className="mt-6 w-full rounded-xl bg-indigo-600 px-6 py-4 text-lg font-bold text-white shadow-md transition-all hover:bg-indigo-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checking ? '確認中...' : '参加する'}
          </button>
        </div>

        {/* 先生用リンク */}
        <p className="text-xs text-gray-400">
          <a
            href="/admin"
            className="underline transition-colors hover:text-gray-600 dark:hover:text-gray-200"
          >
            先生・管理者はこちら
          </a>
        </p>
      </div>
    </main>
  );
}
