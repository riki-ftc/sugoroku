'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { parseExcel, validate, importToSupabase } from '@/lib/excel';
import type { ParsedData, ValidationResult, ImportResult } from '@/lib/excel';

type Step = 'upload' | 'preview' | 'importing' | 'done';

export default function ImportPage() {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // ---------- ファイル読み込み ----------

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const data = parseExcel(buffer);
      const result = validate(data);

      setParsed(data);
      setValidation(result);
      setStep('preview');
    } catch (err) {
      alert(`ファイルの読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ---------- インポート実行 ----------

  const doImport = async () => {
    if (!parsed || !validation?.ok) return;
    setStep('importing');
    const supabase = createClient();
    const result = await importToSupabase(supabase, parsed);
    setImportResult(result);
    setStep('done');
  };

  // ---------- リセット ----------

  const reset = () => {
    setStep('upload');
    setFileName('');
    setParsed(null);
    setValidation(null);
    setImportResult(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Excelインポート</h1>
        {step !== 'upload' && (
          <button onClick={reset} className="text-sm text-gray-500 underline hover:text-gray-700">
            やり直す
          </button>
        )}
      </div>

      {/* ステップインジケーター */}
      <div className="flex gap-2 text-xs">
        {(['upload', 'preview', 'done'] as const).map((s, i) => {
          const labels = ['① アップロード', '② 確認', '③ 完了'];
          const active = step === s || (step === 'importing' && s === 'done');
          return (
            <span
              key={s}
              className={`rounded-full px-3 py-1 ${
                active
                  ? 'bg-blue-600 text-white'
                  : step === 'done' || (step === 'preview' && s === 'upload')
                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    : 'bg-gray-100 text-gray-400 dark:bg-gray-800'
              }`}
            >
              {labels[i]}
            </span>
          );
        })}
      </div>

      {/* ========== STEP 1: アップロード ========== */}
      {step === 'upload' && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
            dragOver
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
              : 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900'
          }`}
        >
          <p className="mb-4 text-4xl">📂</p>
          <p className="mb-2 font-medium">Excelファイルをドラッグ＆ドロップ</p>
          <p className="mb-4 text-sm text-gray-500">または</p>
          <label className="cursor-pointer rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700">
            ファイルを選択
            <input type="file" accept=".xlsx,.xls" onChange={onFileChange} className="hidden" />
          </label>
          <p className="mt-4 text-xs text-gray-400">
            <a href="/template/すごろくマスター管理テンプレート.xlsx" className="underline">
              テンプレートをダウンロード
            </a>
          </p>
        </div>
      )}

      {/* ========== STEP 2: プレビュー ========== */}
      {step === 'preview' && parsed && validation && (
        <div className="space-y-6">
          {/* ファイル情報 */}
          <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm text-gray-500">
              ファイル: <span className="font-medium text-gray-900 dark:text-gray-100">{fileName}</span>
            </p>
          </div>

          {/* バリデーション結果 */}
          {validation.messages.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-semibold">
                チェック結果
                {validation.errorCount > 0 && (
                  <span className="ml-2 text-sm text-red-600">エラー {validation.errorCount}件</span>
                )}
                {validation.warningCount > 0 && (
                  <span className="ml-2 text-sm text-yellow-600">警告 {validation.warningCount}件</span>
                )}
              </h2>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-800">
                {validation.messages.map((m, i) => (
                  <div
                    key={i}
                    className={`flex gap-2 border-b border-gray-100 px-4 py-2 text-sm last:border-0 dark:border-gray-800 ${
                      m.level === 'error' ? 'bg-red-50 dark:bg-red-950' : 'bg-yellow-50 dark:bg-yellow-950'
                    }`}
                  >
                    <span>{m.level === 'error' ? '❌' : '⚠️'}</span>
                    <span className="font-medium">{m.sheet}{m.row ? ` 行${m.row}` : ''}</span>
                    <span className="text-gray-600 dark:text-gray-400">{m.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* データプレビュー */}
          <div className="space-y-4">
            <h2 className="font-semibold">インポート内容</h2>

            {/* ゲーム設定 */}
            <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <h3 className="mb-2 text-sm font-medium text-gray-500">ゲーム設定</h3>
              <p className="text-lg font-bold">{parsed.gameSettings.name}</p>
              {parsed.gameSettings.description && (
                <p className="mt-1 text-sm text-gray-500">{parsed.gameSettings.description}</p>
              )}
              <div className="mt-2 flex gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span>🎲 {parsed.gameSettings.diceCount}d{parsed.gameSettings.diceSides}</span>
                <span>⏱ {parsed.gameSettings.answerTimeLimit}秒</span>
              </div>
            </div>

            {/* 件数サマリー */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'マス', count: parsed.cells.filter((c) => c.isActive).length, emoji: '🗺️' },
                { label: '問題', count: parsed.quizzes.filter((q) => q.isActive).length, emoji: '❓' },
                { label: 'アクション', count: parsed.actions.filter((a) => a.isActive).length, emoji: '⚡' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-lg border border-gray-200 bg-white p-4 text-center dark:border-gray-800 dark:bg-gray-900"
                >
                  <p className="text-2xl">{item.emoji}</p>
                  <p className="mt-1 text-2xl font-bold">{item.count}</p>
                  <p className="text-sm text-gray-500">{item.label}</p>
                </div>
              ))}
            </div>

            {/* 問題一覧（折りたたみ） */}
            <details className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
                問題一覧を表示（{parsed.quizzes.length}件）
              </summary>
              <div className="overflow-x-auto border-t border-gray-200 dark:border-gray-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-2">ID</th>
                      <th className="px-4 py-2">難易度</th>
                      <th className="px-4 py-2">問題文</th>
                      <th className="px-4 py-2">正解</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.quizzes.map((q, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-4 py-2 font-mono text-xs">{q.quizCode}</td>
                        <td className="px-4 py-2">{q.difficulty}</td>
                        <td className="max-w-xs truncate px-4 py-2">{q.question}</td>
                        <td className="px-4 py-2 font-medium">{q.answer}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>

          {/* インポートボタン */}
          <div className="flex gap-3">
            <button
              onClick={doImport}
              disabled={!validation.ok}
              className={`rounded-lg px-6 py-3 font-medium text-white transition-colors ${
                validation.ok
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'cursor-not-allowed bg-gray-400'
              }`}
            >
              {validation.ok ? '✅ インポート実行' : '❌ エラーを修正してください'}
            </button>
            <button onClick={reset} className="rounded-lg border border-gray-300 px-6 py-3 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* ========== STEP 3: インポート中 ========== */}
      {step === 'importing' && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          <p className="text-lg font-medium">インポート中...</p>
          <p className="text-sm text-gray-500">Supabaseにデータを投入しています</p>
        </div>
      )}

      {/* ========== STEP 4: 完了 ========== */}
      {step === 'done' && importResult && (
        <div className="space-y-4">
          {importResult.success ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-950">
              <h2 className="text-lg font-bold text-green-800 dark:text-green-200">🎉 インポート完了！</h2>
              <p className="mt-2 text-sm text-green-700 dark:text-green-300">
                ゲームセットが正常に作成されました。
              </p>
              {importResult.counts && (
                <div className="mt-3 flex gap-4 text-sm">
                  <span>マス: {importResult.counts.cells}件</span>
                  <span>問題: {importResult.counts.quizzes}件</span>
                  <span>アクション: {importResult.counts.actions}件</span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950">
              <h2 className="text-lg font-bold text-red-800 dark:text-red-200">❌ インポート失敗</h2>
              <p className="mt-2 text-sm text-red-700 dark:text-red-300">{importResult.error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={reset} className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700">
              別のファイルをインポート
            </button>
            <a href="/admin" className="rounded-lg border border-gray-300 px-6 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
              管理画面へ戻る
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
