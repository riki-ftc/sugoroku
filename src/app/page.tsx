export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight">🎲 クイズすごろく</h1>
        <p className="text-gray-600 dark:text-gray-400">
          ゲームコードを入力して参加してください
        </p>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <p className="text-sm text-gray-500">
            🚧 開発中 — コード入力フォームは次のセッションで実装します
          </p>
        </div>

        <div className="text-xs text-gray-400">
          <a
            href="/admin"
            className="underline hover:text-gray-600 dark:hover:text-gray-200"
          >
            先生はこちら
          </a>
        </div>
      </div>
    </main>
  );
}
