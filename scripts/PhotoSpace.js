
import { photos } from "./data/photos.js";
import { getAllPhotos, getPhotoNotes, savePhotoNote } from "./utilities/photoDB.js";
import { initPhotoUpload } from "./utilities/photoUpload.js";
import { showAppDialog } from "./components/appDialog.js";
import { renderPhotos } from "./components/photoGallery.js";
import { getProfile } from "./profile.js";
import { isSupabaseConfigured } from "./supabaseClient.js";

const photoGrid = document.querySelector("#photo-grid");


/* =========================
   PROFILE DISPLAY
========================= */

async function renderProfile() {
    const profile = await getProfile();
    const name = document.querySelector("#username");
    const bio = document.querySelector("#profile-bio");
    const mainPicture = document.querySelector("#profile-picture");
    const navPicture = document.querySelector("#nav-profile-picture");

    if (name) name.textContent = profile.name || profile.username || "Your Name";
    if (bio) bio.textContent = profile.bio;
    if (mainPicture) mainPicture.src = profile.profileImage || "pictures/default-profile.svg";
    if (navPicture) navPicture.src = profile.profileImage || "pictures/default-profile.svg";
}

renderProfile();

document.querySelector("#edit-profile-btn").addEventListener("click", () => {
    window.location.href = "edit-page.html";
});

// Open the browser's image picker from the Change button and update both profile images.
const changeProfileButton = document.querySelector("#change-profile-btn");
const profileImageInput = document.querySelector("#profile-image-input");

changeProfileButton?.addEventListener("click", () => profileImageInput?.click());

profileImageInput?.addEventListener("change", async () => {
    const file = profileImageInput.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        profileImageInput.value = "";
        await showAppDialog({ title: "Invalid image", message: "Please choose a valid image file.", mode: "alert" });
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        profileImageInput.value = "";
        await showAppDialog({ title: "Image too large", message: "Please choose an image smaller than 2 MB.", mode: "alert" });
        return;
    }

    try {
        const { readImageAsDataURL, saveProfile } = await import("./profile.js");
        const profile = await getProfile();
        profile.profileImage = await readImageAsDataURL(file);
        await saveProfile(profile);
        await renderProfile();
    } catch (error) {
        console.error("Could not update profile picture:", error);
        await showAppDialog({ title: "Couldn't update picture", message: "The image could not be saved. Please try another one.", mode: "alert" });
    } finally {
        profileImageInput.value = "";
    }
});

// Edit the displayed name using the app's existing custom prompt dialog.
document.querySelector("#edit-name-btn")?.addEventListener("click", async () => {
    const profile = await getProfile();
    const updatedName = await showAppDialog({
        title: "Edit your name",
        message: "Enter the name you want displayed on your PhotoSpace profile.",
        mode: "prompt",
        value: profile.name || profile.username || "",
        confirmText: "Save name"
    });

    if (updatedName === null) return;
    const name = updatedName.trim();
    if (!name) {
        await showAppDialog({ title: "Name required", message: "Your profile name cannot be empty.", mode: "alert" });
        return;
    }

    try {
        const { saveProfile } = await import("./profile.js");
        profile.name = name;
        await saveProfile(profile);
        await renderProfile();
    } catch (error) {
        console.error("Could not save profile name:", error);
        await showAppDialog({ title: "Couldn't save name", message: "Please try again.", mode: "alert" });
    }
});



/* =========================
   PHOTO VIEWER
========================= */

const viewer = document.querySelector("#photo-viewer");
const viewerImage = document.querySelector("#viewer-image");

const viewerName = document.querySelector("#viewer-photo-name");
const viewerSource = document.querySelector("#viewer-photo-source");
const viewerDate = document.querySelector("#viewer-photo-date");

const notesList = document.querySelector("#photo-notes-list");
const noteForm = document.querySelector("#add-note-form");
const noteInput = document.querySelector("#photo-note-input");
const closeViewerButton = document.querySelector("#close-viewer-btn");

let currentPhoto = null;
let viewerObjectURL = null;

const appDialog = document.querySelector("#app-dialog");


// Open a photo
async function openPhoto(photo) {
    currentPhoto = photo;

    viewerName.textContent = photo.name;
    viewerSource.textContent = photo.source || "Not specified";
    viewerDate.textContent = photo.date || "Unknown";

    // Display the image
    if (viewerObjectURL) {
        URL.revokeObjectURL(viewerObjectURL);
        viewerObjectURL = null;
    }

    if (photo.image instanceof Blob) {
        viewerObjectURL = URL.createObjectURL(photo.image);
        viewerImage.src = viewerObjectURL;
    } else {
        viewerImage.src = photo.url;
    }

    viewerImage.alt = photo.name;

    viewer.classList.remove("hidden");
    notesList.innerHTML = "<p class=\"no-notes\">Loading notes…</p>";
    try {
        currentPhoto.notes = await getPhotoNotes(photo.id);
        if (currentPhoto === photo) renderPhotoNotes();
    } catch (error) {
        console.error("Could not load photo notes:", error);
        notesList.innerHTML = "<p class=\"no-notes\">Notes could not be loaded.</p>";
    }
}


// Render notes belonging to the selected photo

function renderPhotoNotes() {
    notesList.innerHTML = "";

    const notes = currentPhoto.notes || [];

    if (notes.length === 0) {
        const message = document.createElement("p");
        message.className = "no-notes";
        message.textContent = "No notes yet. Add your first note!";
        notesList.appendChild(message);
        return;
    }

    notes.forEach(note => {
        const noteElement = document.createElement("article");
        noteElement.className = "photo-note";

        const text = document.createElement("p");
        text.textContent = note.text;

        const date = document.createElement("time");
        date.dateTime = note.createdAt;
        date.textContent = new Date(
            note.createdAt
        ).toLocaleString();

        noteElement.append(text, date);
        notesList.appendChild(noteElement);
    });
}

// Detect clicks on dynamically generated photos
photoGrid.addEventListener("click", event => {
    const image = event.target.closest("img[data-photo-id]");

    if (!image) return;

    const photo = photos.find(
        item => String(item.id) === image.dataset.photoId
    );

    if (photo) {
        openPhoto(photo);
    }
});


// Save a new note
noteForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentPhoto) return;

    const text = noteInput.value.trim();

    if (!text) return;

    // Older photo records may not have a notes array yet.
    if (!currentPhoto.notes) {
        currentPhoto.notes = [];
    }

    try {
        const note = await savePhotoNote(currentPhoto.id, text);
        currentPhoto.notes.push(note);
        noteInput.value = "";
        renderPhotoNotes();
    } catch (error) {
        console.error("Could not save note:", error);
        await showAppDialog({
            title: "Couldn't save note",
            message: "Your note could not be saved. Please try again.",
            mode: "alert"
        });
    }
});


// Close the viewer and release temporary image URLs
function closePhotoViewer() {
    viewer.classList.add("hidden");

    if (viewerObjectURL) {
        URL.revokeObjectURL(viewerObjectURL);
        viewerObjectURL = null;
    }

    viewerImage.removeAttribute("src");
    currentPhoto = null;
    noteInput.value = "";
}



closeViewerButton.addEventListener("click", closePhotoViewer);




// Clicking the dark background also closes the viewer.
viewer.addEventListener("click", event => {
    if (event.target === viewer) {
        closePhotoViewer();
    }
});


// Escape key closes the viewer.
document.addEventListener("keydown", event => {
    const dialogIsOpen = !appDialog.classList.contains("hidden");
    const viewerIsOpen = !viewer.classList.contains("hidden");

    if (
        event.key === "Escape" &&
        viewerIsOpen &&
        !dialogIsOpen
    ) {
        closePhotoViewer();
    }
});

async function initializePhotoSpace() {
    if (!isSupabaseConfigured) {
        photoGrid.innerHTML = '<p class="empty-message">Connect Supabase to load the shared gallery. See supabase/README.md.</p>';
        return;
    }
    let loadError = null;
    try {
        const savedPhotos = await getAllPhotos();

        photos.splice(0, photos.length, ...savedPhotos);
    } catch (error) {
        console.error("Could not load photos:", error);
        loadError = error;
    }

    if (loadError) {
        photoGrid.textContent = "The shared gallery could not be loaded. Check the Supabase setup and try refreshing.";
    } else {
        renderPhotos();
    }

    // Enable uploading after loading is complete.
    initPhotoUpload(renderPhotos);
}

initializePhotoSpace();

