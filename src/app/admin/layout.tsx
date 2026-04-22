import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '管理画面 | クイズすごろく',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* 管理画面ヘッダー */}
      <header className="border-b border-gray-200 bg-white px-6 py-3 dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <a href="/admin" className="text-lg font-bold tracking-tight">
            🎲 クイズすごろく <span className="text-sm font-normal text-gray-500">管理画面</span>
          </a>
          <nav className="flex gap-4 text-sm">
            <a href="/admin" className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
              ゲームセット
            </a>
            <a href="/admin/import" className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
              インポート
            </a>
            <a href="/admin/create-game" className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
              ゲーム作成
            </a>
          </nav>
        </div>
      </header>

      {/* コンテンツ */}
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
