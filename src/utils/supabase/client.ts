import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Supabase browser client (for future client-side Supabase features).
 */
export const createClient = () =>
  createBrowserClient(
    supabaseUrl!,
    supabaseKey!,
  );
