import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const configured = SUPABASE_URL.startsWith("https://")
    && !SUPABASE_URL.includes("YOUR_")
    && SUPABASE_PUBLISHABLE_KEY.length > 20
    && !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_");

export const supabase = configured
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;

export const isSupabaseConfigured = Boolean(supabase);
