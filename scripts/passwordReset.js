import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

function appBase() {
    const parts = location.pathname.split("/");
    parts.pop();
    return `${parts.join("/")}/` || "/";
}

const requestForm = document.querySelector("#reset-request-form");
if (requestForm) {
    const message = document.querySelector("#reset-message");
    requestForm.addEventListener("submit", async event => {
        event.preventDefault();
        const button = requestForm.querySelector("button");
        button.disabled = true;
        const redirectTo = `${location.origin}${appBase()}password-update.html`;
        const { error } = await supabase.auth.resetPasswordForEmail(document.querySelector("#reset-email").value.trim(), { redirectTo });
        message.textContent = error ? error.message : "If an account uses that email, a reset link is on its way.";
        button.disabled = false;
    });
}

const updateForm = document.querySelector("#password-update-form");
if (updateForm) {
    const message = document.querySelector("#password-update-message");
    if (!isSupabaseConfigured) message.textContent = "Supabase is not configured.";
    updateForm.addEventListener("submit", async event => {
        event.preventDefault();
        const password = document.querySelector("#new-password").value;
        if (password !== document.querySelector("#confirm-password").value) {
            message.textContent = "The passwords do not match.";
            return;
        }
        const button = updateForm.querySelector("button");
        button.disabled = true;
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
            message.textContent = error.message;
            button.disabled = false;
            return;
        }
        message.textContent = "Password updated. You can now sign in with it.";
        setTimeout(() => { location.href = `${appBase()}index.html`; }, 1200);
    });
}
