import { supabase } from "./supabaseClient.js";

export async function deleteMyAccount() {
    const { error } = await supabase.functions.invoke("delete-account", { body: {} });
    if (error) throw error;
    await supabase.auth.signOut();
}
