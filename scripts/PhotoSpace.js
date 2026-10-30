import { photos } from "./data/photos.js";
import { deletePhoto, deleteComment, getAllPhotos, getPhotoById, getPhotoCount, getPhotoLikeData, getPhotoNotes, reportContent, savePhotoNote, togglePhotoLike, updateComment, updatePhoto } from "./utilities/photoDB.js";
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
let photoOffset = 0;
const pageSize = 24;
let reportTarget = null;

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
    $("#profile-privacy-label").hidden = !(isOwner && viewingProfile.is_private);

    $("#edit-profile-btn").hidden = !isOwner;
    $("#edit-name-btn").hidden = !isOwner;
    $("#change-profile-btn").hidden = !isOwner;
    $("#add-photo-btn").hidden = !isOwner;
    $("#profile-image-input").hidden = true;
    $("#report-profile-btn").hidden = !currentUser || isOwner;

    $("#edit-profile-btn").addEventListener("click", () => { location.href = "edit-page.html"; });
    $("#change-profile-btn").addEventListener("click", () => $("#profile-image-input").click());
    $("#profile-image-input").addEventListener("change", changeProfileImage);
    $("#edit-name-btn").addEventListener("click", editProfileName);
    $("#report-profile-btn").addEventListener("click", () => openReport("profile", viewingProfile.user_id));

    const profilePhotos = await getAllPhotos(profileId, pageSize, 0);
    photos.splice(0, photos.length, ...profilePhotos);
    photoOffset = profilePhotos.length;
    renderPhotos();
    setText("#post-count", String(await getPhotoCount(profileId)));
    const loadMoreButton = $("#load-more-photos");
    loadMoreButton.hidden = profilePhotos.length < pageSize;
    loadMoreButton.addEventListener("click", async () => {
        loadMoreButton.disabled = true;
        try {
            const more = await getAllPhotos(profileId, pageSize, photoOffset);
            photos.push(...more);
            photoOffset += more.length;
            renderPhotos();
            setText("#post-count", String(await getPhotoCount(profileId)));
            loadMoreButton.hidden = more.length < pageSize;
        } catch (error) { await showAppDialog({ title: "Couldn't load more photos", message: error.message, mode: "alert" }); }
        finally { loadMoreButton.disabled = false; }
    });
    if (isOwner) initPhotoUpload(async () => {
        const refreshed = await getAllPhotos(profileId, pageSize, 0);
        photos.splice(0, photos.length, ...refreshed);
        photoOffset = refreshed.length;
        renderPhotos();
        setText("#post-count", String(await getPhotoCount(profileId)));
        loadMoreButton.hidden = refreshed.length < pageSize;
    });
    const requestedPhotoId = new URLSearchParams(location.search).get("photo");
    if (requestedPhotoId) {
        let requestedPhoto = photos.find(photo => photo.id === requestedPhotoId);
        if (!requestedPhoto) requestedPhoto = await getPhotoById(requestedPhotoId);
        if (requestedPhoto) openPhoto(requestedPhoto);
    }
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
    $("#edit-photo-btn").hidden = !isOwner || photo.ownerId !== currentUser?.id;
    $("#report-photo-btn").hidden = !currentUser || photo.ownerId === currentUser.id;
    $("#share-photo-btn").hidden = Boolean(viewingProfile.is_private);
    $("#photo-note-input").disabled = !currentUser;
    const noteSubmit = noteForm.querySelector("button[type=submit]");
    noteSubmit.hidden = !currentUser;
    noteInput.placeholder = currentUser ? "Write a comment about this photo…" : "Sign in to comment";
    $("#like-photo-btn").disabled = !currentUser;
    $("#like-photo-btn").title = currentUser ? "Like this photo" : "Sign in to like photos";
    viewer.classList.remove("hidden");
    notesList.textContent = "Loading notes…";
    try {
        const [notes, likes] = await Promise.all([getPhotoNotes(photo.id), getPhotoLikeData(photo.id, currentUser?.id)]);
        currentPhoto.notes = notes;
        if (currentPhoto === photo) renderPhotoNotes();
        $("#like-count").textContent = String(likes.count);
        $("#like-heart").textContent = likes.liked ? "♥" : "♡";
        $("#like-photo-btn").setAttribute("aria-pressed", String(likes.liked));
    } catch (error) { console.error(error); notesList.textContent = "Comments or likes could not be loaded."; }
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
        const author = document.createElement("strong");
        author.textContent = `@${note.username || "member"}`;
        const text = document.createElement("p");
        text.textContent = note.text;
        const date = document.createElement("time");
        date.dateTime = note.createdAt;
        date.textContent = new Date(note.createdAt).toLocaleString();
        article.append(author, text, date);
        if (currentUser && note.owner_id === currentUser.id) {
            const edit = document.createElement("button");
            edit.type = "button"; edit.dataset.commentAction = "edit"; edit.dataset.commentId = note.id; edit.textContent = "Edit";
            const remove = document.createElement("button");
            remove.type = "button"; remove.dataset.commentAction = "delete"; remove.dataset.commentId = note.id; remove.textContent = "Delete";
            article.append(edit, remove);
        } else if (currentUser) {
            const report = document.createElement("button");
            report.type = "button"; report.dataset.commentAction = "report"; report.dataset.commentId = note.id; report.textContent = "Report";
            article.append(report);
        }
        notesList.append(article);
    });
}

notesList.addEventListener("click", async event => {
    const button = event.target.closest("button[data-comment-action]");
    if (!button || !currentPhoto) return;
    const note = currentPhoto.notes.find(item => item.id === button.dataset.commentId);
    if (!note) return;
    if (button.dataset.commentAction === "report") return openReport("comment", note.id);
    if (button.dataset.commentAction === "edit") {
        const text = await showAppDialog({ title: "Edit comment", message: "Update your comment.", mode: "prompt", value: note.text, confirmText: "Save" });
        if (text === null || !text.trim()) return;
        try { await updateComment(note.id, text); note.text = text.trim(); renderPhotoNotes(); }
        catch (error) { await showAppDialog({ title: "Couldn't edit comment", message: error.message, mode: "alert" }); }
    }
    if (button.dataset.commentAction === "delete") {
        const ok = await showAppDialog({ title: "Delete comment?", message: "Your comment will be removed.", mode: "confirm", danger: true, confirmText: "Delete" });
        if (!ok) return;
        try { await deleteComment(note.id); currentPhoto.notes = currentPhoto.notes.filter(item => item.id !== note.id); renderPhotoNotes(); }
        catch (error) { await showAppDialog({ title: "Couldn't delete comment", message: error.message, mode: "alert" }); }
    }
});

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

function openReport(type, id) {
    if (!currentUser) return location.assign("auth.html");
    reportTarget = { type, id };
    $("#report-message").textContent = "";
    $("#report-details").value = "";
    $("#report-modal").classList.remove("hidden");
}

$("#report-photo-btn").addEventListener("click", () => currentPhoto && openReport("photo", currentPhoto.id));
$("#close-report-btn").addEventListener("click", () => $("#report-modal").classList.add("hidden"));
$("#report-modal").addEventListener("click", event => { if (event.target === $("#report-modal")) $("#report-modal").classList.add("hidden"); });
$("#report-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (!reportTarget) return;
    const submit = $("#report-form").querySelector("button[type=submit]");
    submit.disabled = true;
    try {
        await reportContent(reportTarget.type, reportTarget.id, $("#report-reason").value, $("#report-details").value);
        $("#report-modal").classList.add("hidden");
        await showAppDialog({ title: "Report received", message: "Thanks. A moderator will review it.", mode: "alert" });
    } catch (error) { $("#report-message").textContent = error.message; }
    finally { submit.disabled = false; }
});

$("#like-photo-btn").addEventListener("click", async () => {
    if (!currentUser || !currentPhoto) return;
    const button = $("#like-photo-btn");
    button.disabled = true;
    try {
        const before = await getPhotoLikeData(currentPhoto.id, currentUser.id);
        await togglePhotoLike(currentPhoto.id, currentUser.id, before.liked);
        const after = await getPhotoLikeData(currentPhoto.id, currentUser.id);
        $("#like-count").textContent = String(after.count);
        $("#like-heart").textContent = after.liked ? "♥" : "♡";
        button.setAttribute("aria-pressed", String(after.liked));
    } catch (error) { await showAppDialog({ title: "Couldn't update like", message: error.message, mode: "alert" }); }
    finally { button.disabled = false; }
});

$("#share-photo-btn").addEventListener("click", async () => {
    if (!currentPhoto?.ownerId) return;
    const url = new URL("profile.html", location.href);
    url.searchParams.set("id", currentPhoto.ownerId);
    url.searchParams.set("photo", currentPhoto.id);
    try {
        if (navigator.share) await navigator.share({ title: currentPhoto.name, text: "View this photo on PhotoSpace", url: url.href });
        else {
            await navigator.clipboard.writeText(url.href);
            await showAppDialog({ title: "Link copied", message: "The photo link is ready to share.", mode: "alert" });
        }
    } catch (error) {
        if (error.name !== "AbortError") await showAppDialog({ title: "Couldn't share link", message: "Copy this address from your browser: " + url.href, mode: "alert" });
    }
});

$("#edit-photo-btn").addEventListener("click", async () => {
    if (!isOwner || !currentPhoto) return;
    const name = await showAppDialog({ title: "Edit photo name", message: "Update the title shown with this photo.", mode: "prompt", value: currentPhoto.name, confirmText: "Continue" });
    if (name === null || !name.trim()) return;
    const source = await showAppDialog({ title: "Edit photo source", message: "Update the camera or source.", mode: "prompt", value: currentPhoto.source, confirmText: "Save" });
    if (source === null) return;
    try {
        await updatePhoto(currentPhoto.id, { name, source });
        currentPhoto.name = name.trim(); currentPhoto.source = source.trim();
        $("#viewer-photo-name").textContent = currentPhoto.name;
        $("#viewer-photo-source").textContent = currentPhoto.source || "Not specified";
        renderPhotos();
    } catch (error) { await showAppDialog({ title: "Couldn't update photo", message: error.message, mode: "alert" }); }
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
        setText("#post-count", String(await getPhotoCount(viewingProfile.user_id)));
        closePhotoViewer();
    } catch (error) { await showAppDialog({ title: "Couldn't delete photo", message: error.message, mode: "alert" }); }
});

initProfile().catch(error => {
    console.error("Could not open profile:", error);
    if (photoGrid) photoGrid.textContent = "This profile could not be loaded. Please refresh and try again.";
});
