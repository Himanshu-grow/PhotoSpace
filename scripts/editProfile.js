import { supabase } from "./supabaseClient.js";
import { getProfile, saveProfile, uploadProfileImage } from "./profile.js";
import { deleteMyAccount } from "./account.js";

const form = document.querySelector("#profile-form");
const message = document.querySelector("#profile-save-message");
const image = document.querySelector(".profile-image");
const imageInput = document.querySelector("#edit-profile-image-input");
const bio = document.querySelector("#bio");
const count = document.querySelector(".character-count");
let profile;

async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { location.href = "auth.html"; return; }
    profile = await getProfile(user.id);
    document.querySelector("#username").value = profile.username;
    document.querySelector("#name").value = profile.name;
    bio.value = profile.bio || "";
    document.querySelector("#is-private").checked = Boolean(profile.is_private);
    image.src = profile.profileImage;
    updateCount();
}

function updateCount() { count.textContent = `${bio.value.length} / ${bio.maxLength}`; }
bio.addEventListener("input", updateCount);
document.querySelector(".change-picture-btn").addEventListener("click", () => imageInput.click());
document.querySelector(".remove-picture-btn").addEventListener("click", () => {
    profile.profile_image_path = null;
    profile.profileImage = "pictures/default-profile.svg";
    image.src = profile.profileImage;
    imageInput.value = "";
});

imageInput.addEventListener("change", async () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
        message.textContent = "Choose an image smaller than 2 MB.";
        imageInput.value = "";
        return;
    }
    try {
        profile.profile_image_path = await uploadProfileImage(file);
        profile.profileImage = (await supabase.storage.from("photos").createSignedUrl(profile.profile_image_path, 3600)).data.signedUrl;
        image.src = profile.profileImage;
        message.textContent = "Picture uploaded. Save changes to publish it on your profile.";
    } catch (error) { message.textContent = error.message; }
});

form.addEventListener("submit", async event => {
    event.preventDefault();
    const username = document.querySelector("#username").value.trim().toLowerCase();
    const name = document.querySelector("#name").value.trim();
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
        message.textContent = "Username must be 3–24 letters, numbers, or underscores.";
        return;
    }
    if (!name) { message.textContent = "Display name is required."; return; }
    const button = document.querySelector(".save-btn");
    button.disabled = true;
    message.textContent = "Saving…";
    try {
        profile = await saveProfile({ ...profile, username, name, bio: bio.value, is_private: document.querySelector("#is-private").checked });
        location.href = `profile.html?id=${encodeURIComponent(profile.user_id)}`;
    } catch (error) {
        message.textContent = error.code === "23505" ? "That username is already taken." : error.message;
        button.disabled = false;
    }
});

document.querySelector("#delete-account-btn").addEventListener("click", async () => {
    if (!window.confirm("Permanently delete your account, profile, photos, comments, and likes? This cannot be undone.")) return;
    const button = document.querySelector("#delete-account-btn");
    const deleteMessage = document.querySelector("#delete-account-message");
    button.disabled = true;
    deleteMessage.textContent = "Deleting your account…";
    try {
        await deleteMyAccount();
        location.href = "index.html";
    } catch (error) {
        let reason = error.message || "Please try again.";
        if (error.context instanceof Response) {
            try {
                const response = await error.context.json();
                if (response.error) reason = response.error;
            } catch { /* Use the function client's message when no JSON error is returned. */ }
        }
        deleteMessage.textContent = `Account deletion failed: ${reason}`;
        button.disabled = false;
    }
});

loadProfile().catch(error => { console.error(error); message.textContent = "Could not load profile. Refresh or sign in again."; });
