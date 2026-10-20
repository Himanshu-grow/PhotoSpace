
import { photos } from "./data/photos.js";
import { getAllPhotos, savePhoto, deletePhoto } from "./utilities/photoDB.js";
import { initPhotoUpload } from "./utilities/photoUpload.js";
import { showAppDialog } from "./components/appDialog.js";
import { renderPhotos } from "./components/photoGallery.js";
import { getProfile } from "./profile.js";

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
function openPhoto(photo) {
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

    // Display this photo's existing notes
    renderPhotoNotes();

    viewer.classList.remove("hidden");
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

        const actions = document.createElement("div");
        actions.className = "note-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.textContent = "Edit";
        editButton.dataset.action = "edit";
        editButton.dataset.noteId = note.id;

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.textContent = "Delete";
        deleteButton.dataset.action = "delete";
        deleteButton.dataset.noteId = note.id;

        actions.append(editButton, deleteButton);
        noteElement.append(text, date, actions);
        notesList.appendChild(noteElement);
    });
}


notesList.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");

    if (!button || !currentPhoto) return;

    const action = button.dataset.action;
    const noteId = button.dataset.noteId;

    const notes = currentPhoto.notes || [];

    const index = notes.findIndex(
        note => String(note.id) === noteId
    );

    if (index === -1) return;

    const note = notes[index];

    // EDIT NOTE
    if (action === "edit") {

    const updatedText = await showAppDialog({
        title: "Edit note",
        message: "Make changes to your thoughts about this photo.",
        mode: "prompt",
        value: note.text,
        confirmText: "Save changes"
    });


        // Cancelled or unchanged
        if (updatedText === null) return;

        const trimmedText = updatedText.trim();

        if (!trimmedText) {

        await showAppDialog({
            title: "Empty note",
            message: "Please enter some text before saving.",
            mode: "alert"
        });
        
            return;
        }

        const previousText = note.text;
        note.text = trimmedText;

        try {
            await savePhoto(currentPhoto);
            renderPhotoNotes();
        } catch (error) {
            note.text = previousText;

            console.error("Could not edit note:", error);
            await showAppDialog({
                title: "Couldn't save note",
                message: "Something went wrong while saving your note. Please try again.",
                mode: "alert",
                confirmText: "Understood"
            });
        }
    }

    // DELETE NOTE
    if (action === "delete") {

    const confirmed = await showAppDialog({
        title: "Delete note?",
        message: "This note will be permanently removed.",
        mode: "confirm",
        danger: true,
        confirmText: "Delete note"
    });


        if (!confirmed) return;

        const removedNote = notes.splice(index, 1)[0];

        try {
            await savePhoto(currentPhoto);
            renderPhotoNotes();
        } catch (error) {
            notes.splice(index, 0, removedNote);

            console.error("Could not delete note:", error);
            await showAppDialog({
                title: "Couldn't delete note",
                message: "Your note could not be deleted. Please try again.",
                mode: "alert"
            });
        }
    }
});



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

    const note = {
        id: Date.now(),
        text: text,
        createdAt: new Date().toISOString()
    };

    currentPhoto.notes.push(note);

    try {
        // Save the updated photo record to IndexedDB.
        await savePhoto(currentPhoto);

        noteInput.value = "";
        renderPhotoNotes();
    } catch (error) {
        // Roll back the in-memory change if saving fails.
        currentPhoto.notes.pop();

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

const deletePhotoButton = document.querySelector("#delete-photo-btn");

deletePhotoButton.addEventListener("click", async () => {
    if (!currentPhoto) return;

    const photoToDelete = currentPhoto;


const confirmed = await showAppDialog({
    title: "Remove this photo?",
    message:
        `Are you sure you want to remove "${photoToDelete.name}"?\n\n` +
        "The photo and its notes will be permanently deleted from this browser.",
    mode: "confirm",
    danger: true,
    confirmText: "Remove photo"
});


    if (!confirmed) return;

    try {
        // First delete the saved database record.
        await deletePhoto(photoToDelete.id);

        // Then remove it from the in-memory array.
        const index = photos.findIndex(
            photo => String(photo.id) === String(photoToDelete.id)
        );

        if (index !== -1) {
            photos.splice(index, 1);
        }

        // Refresh the gallery and close the viewer.
        renderPhotos();
        closePhotoViewer();

    } catch (error) {
        console.error("Could not delete photo:", error);

        await showAppDialog({
            title: "Couldn't remove photo",
            message: "The photo could not be removed. Please try again.",
            mode: "alert"
        });
    }
});



async function initializePhotoSpace() {
    try {
        const savedPhotos = await getAllPhotos();

        photos.splice(0, photos.length, ...savedPhotos);
    } catch (error) {
        console.error("Could not load photos:", error);
    }

    // Render only after the initial database load finishes.
    renderPhotos();

    // Enable uploading after loading is complete.
    initPhotoUpload(renderPhotos);
}

initializePhotoSpace();

