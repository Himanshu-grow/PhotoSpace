import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

const actions = document.querySelector("#nav-actions");
if (actions) {
    const { data: { user } } = isSupabaseConfigured
        ? await supabase.auth.getUser()
        : { data: { user: null } };
    if (user) {
        const { data: isModerator } = await supabase.rpc("is_moderator");
        actions.innerHTML = `<a class="auth-nav-link" href="profile.html?id=${encodeURIComponent(user.id)}">My profile</a>${isModerator ? '<a class="auth-nav-link" href="moderation.html">Moderation</a>' : ""}<button type="button" class="auth-nav-button" id="sign-out-button">Sign out</button>`;
        document.querySelector("#sign-out-button").addEventListener("click", async () => {
            await supabase.auth.signOut();
            window.location.href = "index.html";
        });
    } else {
        actions.innerHTML = '<a class="auth-nav-link" href="auth.html">Sign in / Join</a>';
    }
}
