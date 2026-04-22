import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * サーバー側（Server Component、Route Handler、Server Action）で使う Supabase クライアント。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component 内では set は無視される（middleware で対応）
          }
        },
      },
    },
  );
}
