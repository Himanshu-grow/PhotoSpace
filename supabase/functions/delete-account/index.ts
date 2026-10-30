import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const authorization = request.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization || !supabaseUrl || !secretKey || !publishableKey) {
    return Response.json({ error: "Function is not configured." }, { status: 500, headers: corsHeaders });
  }

  const token = authorization.replace(/^Bearer\s+/i, "");
  const publicClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await publicClient.auth.getUser(token);
  if (authError || !user) return Response.json({ error: "Sign in to delete your account." }, { status: 401, headers: corsHeaders });

  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const paths: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from("photos").list(user.id, { limit: 1000, offset });
    if (error) return Response.json({ error: "Could not prepare account images for deletion." }, { status: 500, headers: corsHeaders });
    paths.push(...(data || []).filter((item) => item.id).map((item) => `${user.id}/${item.name}`));
    if (!data || data.length < 1000) break;
  }
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from("photos").remove(paths.slice(i, i + 100));
    if (error) return Response.json({ error: "Could not remove all account images. No account data was deleted; please retry." }, { status: 500, headers: corsHeaders });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return Response.json({ error: "Could not delete the account." }, { status: 500, headers: corsHeaders });
  return Response.json({ success: true }, { headers: corsHeaders });
});
