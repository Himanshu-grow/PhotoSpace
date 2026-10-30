import { supabase, isSupabaseConfigured } from "./supabaseClient.js";

const signinForm = document.querySelector("#signin-form");
const signupForm = document.querySelector("#signup-form");
const message = document.querySelector("#auth-message");
const title = document.querySelector("#auth-title");
const intro = document.querySelector("#auth-intro");

function appBase() {
    const parts = window.location.pathname.split("/");
    parts.pop();
    return `${parts.join("/")}/` || "/";
}

function showMode(mode) {
    const signup = mode === "signup";
    signinForm.classList.toggle("hidden", signup);
    signupForm.classList.toggle("hidden", !signup);
    document.querySelector("#show-signin").classList.toggle("active", !signup);
    document.querySelector("#show-signup").classList.toggle("active", signup);
    document.querySelector("#show-signin").setAttribute("aria-selected", String(!signup));
    document.querySelector("#show-signup").setAttribute("aria-selected", String(signup));
    title.textContent = signup ? "Make space for your photos" : "Welcome back";
    intro.textContent = signup ? "Create an account and start building your public profile." : "Sign in to share photos and manage your profile.";
    message.textContent = "";
}

document.querySelector("#show-signin").addEventListener("click", () => showMode("signin"));
document.querySelector("#show-signup").addEventListener("click", () => showMode("signup"));

if (!isSupabaseConfigured) {
    message.textContent = "Connect the Supabase project in scripts/config.js first.";
    signinForm.querySelector("button").disabled = true;
    signupForm.querySelector("button").disabled = true;
}

signinForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!isSupabaseConfigured) return;
    const button = signinForm.querySelector("button");
    button.disabled = true;
    message.textContent = "Signing in…";
    const { error } = await supabase.auth.signInWithPassword({
        email: document.querySelector("#signin-email").value.trim(),
        password: document.querySelector("#signin-password").value
    });
    if (error) {
        message.textContent = error.message;
        button.disabled = false;
        return;
    }
    window.location.href = `${appBase()}index.html`;
});

signupForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!isSupabaseConfigured) return;
    const username = document.querySelector("#signup-username").value.trim().toLowerCase();
    const name = document.querySelector("#signup-name").value.trim();
    const email = document.querySelector("#signup-email").value.trim();
    const password = document.querySelector("#signup-password").value;
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
        message.textContent = "Username must be 3–24 characters using letters, numbers, and underscores.";
        return;
    }
    const button = signupForm.querySelector("button");
    button.disabled = true;
    message.textContent = "Creating account…";
    const redirectTo = `${window.location.origin}${appBase()}index.html`;
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username, name }, emailRedirectTo: redirectTo }
    });
    if (error) {
        message.textContent = error.message;
        button.disabled = false;
        return;
    }
    if (data.session) {
        window.location.href = `${appBase()}index.html`;
        return;
    }
    message.textContent = "Account created. Check your email for the confirmation link, then sign in.";
    button.disabled = false;
});

if (isSupabaseConfigured) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) window.location.href = `${appBase()}index.html`;
}
