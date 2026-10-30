import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import { getAllPhotos } from "./utilities/photoDB.js";
import { getProfiles } from "./profile.js";
import "./authNav.js";

const profileList = document.querySelector("#profile-list");
const recentPhotos = document.querySelector("#recent-photos");
const searchInput = document.querySelector("#profile-search");
const fallbackAvatar = "pictures/default-profile.svg";

function profileCard(profile) {
    const link = document.createElement("a");
    link.className = "community-card";
    link.href = `profile.html?id=${encodeURIComponent(profile.user_id)}`;
    const avatar = document.createElement("img");
    avatar.src = profile.profileImage || fallbackAvatar;
    avatar.alt = "";
    avatar.className = "community-avatar";
    const content = document.createElement("div");
    content.className = "community-card-copy";
    const name = document.createElement("h3");
    name.textContent = profile.name || profile.username;
    const username = document.createElement("p");
    username.textContent = `@${profile.username}`;
    const bio = document.createElement("p");
    bio.className = "community-bio";
    bio.textContent = profile.bio || "A PhotoSpace member";
    content.append(name, username, bio);
    link.append(avatar, content);
    return link;
}

function renderProfiles(profiles) {
    profileList.replaceChildren();
    if (!profiles.length) {
        profileList.innerHTML = '<p class="empty-message">No profiles found yet. Be the first to join.</p>';
        return;
    }
    profiles.forEach(profile => profileList.append(profileCard(profile)));
}

function renderRecentPhotos(photos, profiles) {
    recentPhotos.replaceChildren();
    if (!photos.length) {
        recentPhotos.innerHTML = '<p class="empty-message">No member photos yet.</p>';
        return;
    }
    const profileById = new Map(profiles.map(profile => [profile.user_id, profile]));
    photos.forEach(photo => {
        const owner = profileById.get(photo.ownerId);
        if (!owner) return;
        const card = document.createElement("a");
        card.className = "recent-photo-card";
        card.href = `profile.html?id=${encodeURIComponent(owner.user_id)}`;
        const image = document.createElement("img");
        image.src = photo.url;
        image.alt = photo.name;
        const details = document.createElement("div");
        details.className = "recent-photo-copy";
        const name = document.createElement("strong");
        name.textContent = photo.name;
        const credit = document.createElement("span");
        credit.textContent = `by @${owner.username}`;
        details.append(name, credit);
        card.append(image, details);
        recentPhotos.append(card);
    });
}

if (!isSupabaseConfigured) {
    profileList.textContent = "Configure Supabase to explore community profiles.";
    recentPhotos.replaceChildren();
} else {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const cta = document.querySelector(".explore-cta");
            cta.href = `profile.html?id=${encodeURIComponent(user.id)}`;
            cta.innerHTML = "Open your profile <span aria-hidden=\"true\">↗</span>";
        }
        const [profiles, photos] = await Promise.all([getProfiles(), getAllPhotos(null, 24)]);
        renderProfiles(profiles);
        renderRecentPhotos(photos, profiles);
        searchInput.addEventListener("input", async () => {
            try { renderProfiles(await getProfiles(searchInput.value)); }
            catch (error) { console.error("Could not search profiles:", error); }
        });
    } catch (error) {
        console.error("Could not load the community:", error);
        profileList.textContent = "The community could not be loaded. Check your Supabase setup and refresh.";
        recentPhotos.replaceChildren();
    }
}
