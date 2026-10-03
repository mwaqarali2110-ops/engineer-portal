/**
 * Supabase client factory.
 *
 * Phase 1 runs on mock data, so the client is created lazily and only when the
 * public URL + anon key are present. Nothing in this app may use a service-role
 * key — that key must never reach frontend code.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from './env';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

/**
 * Use inside a service when a Supabase-backed path is reached without a
 * configured client, so the failure is loud instead of silent.
 */
export function requireSupabaseClient(): SupabaseClient {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or keep VITE_USE_MOCK_DATA=true.',
    );
  }
  return supabase;
}
