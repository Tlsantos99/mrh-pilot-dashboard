import { createClient } from '@supabase/supabase-js';

// Server-side only — uses service role key, never exposed to browser
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase server environment variables');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      // Disable Next.js Data Cache for all Supabase fetch calls
      fetch: (url: RequestInfo | URL, options: RequestInit = {}) =>
        fetch(url, { ...options, cache: 'no-store' }),
    },
  });
}
