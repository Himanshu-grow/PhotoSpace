import { supabase } from "./supabaseClient.js";
import { getProfile, saveProfile, uploadProfileImage } from "./profile.js";

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
        profile.profileImage = supabase.storage.from("photos").getPublicUrl(profile.profile_image_path).data.publicUrl;
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
        profile = await saveProfile({ ...profile, username, name, bio: bio.value });
        location.href = `profile.html?id=${encodeURIComponent(profile.user_id)}`;
    } catch (error) {
        message.textContent = error.code === "23505" ? "That username is already taken." : error.message;
        button.disabled = false;
    }
});

loadProfile().catch(error => { console.error(error); message.textContent = "Could not load profile. Refresh or sign in again."; });
