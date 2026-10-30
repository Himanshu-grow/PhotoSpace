import { photos } from "./data/photos.js";
import { deletePhoto, getAllPhotos, getPhotoNotes, savePhotoNote } from "./utilities/photoDB.js";
import { initPhotoUpload } from "./utilities/photoUpload.js";
import { showAppDialog } from "./components/appDialog.js";
import { renderPhotos } from "./components/photoGallery.js";
import { getProfile, saveProfile, uploadProfileImage } from "./profile.js";
import { supabase, isSupabaseConfigured } from "./supabaseClient.js";
import "./authNav.js";

const $ = selector => document.querySelector(selector);
const photoGrid = $("#photo-grid");
const viewer = $("#photo-viewer");
const notesList = $("#photo-notes-list");
const noteForm = $("#add-note-form");
const noteInput = $("#photo-note-input");
const appDialog = $("#app-dialog");
let currentPhoto = null;
let viewerObjectURL = null;
let currentUser = null;
let viewingProfile = null;
let isOwner = false;

function setText(selector, value) { const node = $(selector); if (node) node.textContent = value; }

async function initProfile() {
    if (!isSupabaseConfigured) {
        photoGrid.textContent = "Connect Supabase to view profiles.";
        return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;
    const profileId = new URLSearchParams(location.search).get("id") || user?.id;
    if (!profileId) {
        photoGrid.innerHTML = 'This profile could not be found. <a href="index.html">Explore PhotoSpace</a>.';
        return;
    }
    try { viewingProfile = await getProfile(profileId); }
    catch (error) { console.error(error); }
    if (!viewingProfile?.user_id) {
        photoGrid.innerHTML = 'This profile could not be found. <a href="index.html">Explore PhotoSpace</a>.';
        return;
    }
    isOwner = Boolean(currentUser && currentUser.id === viewingProfile.user_id);
    document.title = `${viewingProfile.name || viewingProfile.username} | PhotoSpace`;
    setText("#username", viewingProfile.name || viewingProfile.username);
    setText("#profile-bio", viewingProfile.bio || "No bio yet.");
    setText("#post-count", "…");
    const avatar = viewingProfile.profileImage || "pictures/default-profile.svg";
    $("#profile-picture").src = avatar;
    const usernameLabel = document.querySelector("#profile-username");
    if (usernameLabel) usernameLabel.textContent = `@${viewingProfile.username}`;

    $("#edit-profile-btn").hidden = !isOwner;
    $("#edit-name-btn").hidden = !isOwner;
    $("#change-profile-btn").hidden = !isOwner;
    $("#add-photo-btn").hidden = !isOwner;
    $("#profile-image-input").hidden = true;

    $("#edit-profile-btn").addEventListener("click", () => { location.href = "edit-page.html"; });
    $("#change-profile-btn").addEventListener("click", () => $("#profile-image-input").click());
    $("#profile-image-input").addEventListener("change", changeProfileImage);
    $("#edit-name-btn").addEventListener("click", editProfileName);

    const profilePhotos = await getAllPhotos(profileId);
    photos.splice(0, photos.length, ...profilePhotos);
    renderPhotos();
    setText("#post-count", String(profilePhotos.length));
    if (isOwner) initPhotoUpload(async () => {
        const refreshed = await getAllPhotos(profileId);
        photos.splice(0, photos.length, ...refreshed);
        renderPhotos();
        setText("#post-count", String(refreshed.length));
    });
}

async function changeProfileImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
        await showAppDialog({ title: "Choose a smaller image", message: "Use an image file smaller than 2 MB.", mode: "alert" });
        event.target.value = "";
        return;
    }
    try {
        viewingProfile.profile_image_path = await uploadProfileImage(file);
        viewingProfile = await saveProfile(viewingProfile);
        $("#profile-picture").src = viewingProfile.profileImage;
    } catch (error) {
        await showAppDialog({ title: "Couldn't update picture", message: error.message, mode: "alert" });
    } finally { event.target.value = ""; }
}

async function editProfileName() {
    const name = await showAppDialog({ title: "Edit your name", message: "Choose the name shown on your profile.", mode: "prompt", value: viewingProfile.name, confirmText: "Save name" });
    if (name === null) return;
    if (!name.trim()) return showAppDialog({ title: "Name required", message: "Enter a name before saving.", mode: "alert" });
    try {
        viewingProfile.name = name.trim();
        viewingProfile = await saveProfile(viewingProfile);
        setText("#username", viewingProfile.name);
    } catch (error) {
        await showAppDialog({ title: "Couldn't save name", message: error.message, mode: "alert" });
    }
}

async function openPhoto(photo) {
    currentPhoto = photo;
    $("#viewer-photo-name").textContent = photo.name;
    $("#viewer-photo-source").textContent = photo.source || "Not specified";
    $("#viewer-photo-date").textContent = photo.date || "Unknown";
    if (viewerObjectURL) URL.revokeObjectURL(viewerObjectURL);
    viewerObjectURL = photo.image instanceof Blob ? URL.createObjectURL(photo.image) : null;
    $("#viewer-image").src = viewerObjectURL || photo.url;
    $("#viewer-image").alt = photo.name;
    $("#delete-photo-btn").hidden = !isOwner || photo.ownerId !== currentUser?.id;
    $("#delete-photo-btn").disabled = false;
    $("#photo-note-input").disabled = !currentUser;
    const noteSubmit = noteForm.querySelector("button[type=submit]");
    noteSubmit.hidden = !currentUser;
    noteInput.placeholder = currentUser ? "Write a note about this photo…" : "Sign in to add a note";
    viewer.classList.remove("hidden");
    notesList.textContent = "Loading notes…";
    try {
        currentPhoto.notes = await getPhotoNotes(photo.id);
        if (currentPhoto === photo) renderPhotoNotes();
    } catch (error) { console.error(error); notesList.textContent = "Notes could not be loaded."; }
}

function renderPhotoNotes() {
    notesList.replaceChildren();
    if (!currentPhoto?.notes?.length) {
        const empty = document.createElement("p");
        empty.className = "no-notes";
        empty.textContent = "No notes yet.";
        notesList.append(empty);
        return;
    }
    currentPhoto.notes.forEach(note => {
        const article = document.createElement("article");
        article.className = "photo-note";
        const text = document.createElement("p");
        text.textContent = note.text;
        const date = document.createElement("time");
        date.dateTime = note.createdAt;
        date.textContent = new Date(note.createdAt).toLocaleString();
        article.append(text, date);
        notesList.append(article);
    });
}

photoGrid.addEventListener("click", event => {
    const image = event.target.closest("img[data-photo-id]");
    const photo = image && photos.find(item => String(item.id) === image.dataset.photoId);
    if (photo) openPhoto(photo);
});

noteForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!currentPhoto || !currentUser || !noteInput.value.trim()) return;
    try {
        const note = await savePhotoNote(currentPhoto.id, noteInput.value);
        currentPhoto.notes.push(note);
        noteInput.value = "";
        renderPhotoNotes();
    } catch (error) {
        await showAppDialog({ title: "Couldn't save note", message: error.message, mode: "alert" });
    }
});

function closePhotoViewer() {
    viewer.classList.add("hidden");
    if (viewerObjectURL) URL.revokeObjectURL(viewerObjectURL);
    viewerObjectURL = null;
    $("#viewer-image").removeAttribute("src");
    currentPhoto = null;
    noteInput.value = "";
}

$("#close-viewer-btn").addEventListener("click", closePhotoViewer);
viewer.addEventListener("click", event => { if (event.target === viewer) closePhotoViewer(); });
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !viewer.classList.contains("hidden") && appDialog.classList.contains("hidden")) closePhotoViewer();
});

$("#delete-photo-btn").addEventListener("click", async () => {
    if (!isOwner || !currentPhoto || currentPhoto.ownerId !== currentUser?.id) return;
    const confirmed = await showAppDialog({ title: "Delete photo?", message: "The photo and its notes will be removed.", mode: "confirm", danger: true, confirmText: "Delete photo" });
    if (!confirmed) return;
    try {
        await deletePhoto(currentPhoto);
        const index = photos.findIndex(photo => photo.id === currentPhoto.id);
        if (index >= 0) photos.splice(index, 1);
        renderPhotos();
        setText("#post-count", String(photos.length));
        closePhotoViewer();
    } catch (error) { await showAppDialog({ title: "Couldn't delete photo", message: error.message, mode: "alert" }); }
});

initProfile().catch(error => {
    console.error("Could not open profile:", error);
    if (photoGrid) photoGrid.textContent = "This profile could not be loaded. Please refresh and try again.";
});
