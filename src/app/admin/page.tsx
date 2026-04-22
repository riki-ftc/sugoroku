export default function AdminPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">管理画面ホーム</h1>
      <p className="text-gray-600 dark:text-gray-400">
        まずはExcelテンプレートをインポートしてゲームセットを作成してください。
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <a
          href="/admin/import"
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="mb-2 text-2xl">📥</div>
          <h2 className="font-semibold">Excelインポート</h2>
          <p className="mt-1 text-sm text-gray-500">
            テンプレートファイルをアップロードしてゲームセットを作成
          </p>
        </a>

        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-2 text-2xl">🎮</div>
          <h2 className="font-semibold text-gray-400">ゲーム作成</h2>
          <p className="mt-1 text-sm text-gray-400">
            セッション4で実装予定
          </p>
        </div>
      </div>
    </div>
  );
}
