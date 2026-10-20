
import { photos } from "../data/photos.js";
import { savePhoto } from "./photoDB.js";
import { showAppDialog } from "../components/appDialog.js";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function initPhotoUpload(onPhotoAdded) {
    const photoName = document.querySelector("#photo-name");
    const photoSource = document.querySelector("#photo-source");
    const modal = document.querySelector("#photo-modal");
    const addButton = document.querySelector("#add-photo-btn");
    const closeButton = document.querySelector("#close-modal-btn");
    const photoInput = document.querySelector("#photo-input");
    const preview = document.querySelector("#image-preview");
    const uploadButton = document.querySelector("#upload-photo-btn");

    let selectedFile = null;
    let previewUrl = null;

    // Open modal
    addButton.addEventListener("click", () => {
        modal.classList.remove("hidden");
        photoName.focus();
    });

    // Close modal
    closeButton.addEventListener("click", closeModal);

    function closeModal() {
        modal.classList.add("hidden");

        photoInput.value = "";
        photoName.value = "";
        photoSource.value = "";
        preview.innerHTML = "";

        selectedFile = null;

        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            previewUrl = null;
        }
    }

    // Select a photo and preview it
    photoInput.addEventListener("change", async () => {
        const file = photoInput.files[0];

        if (!file) return;

        if (!file.type.startsWith("image/")) {
            selectedFile = null;
            photoInput.value = "";

            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
                previewUrl = null;
            }

            preview.innerHTML = "";

            await showAppDialog({
                title: "Invalid file",
                message: "Please select a valid image file.",
                mode: "alert"
            });

            return;
        }

        selectedFile = file;

        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
        }

        previewUrl = URL.createObjectURL(file);

        preview.innerHTML = "";

        const image = document.createElement("img");
        image.src = previewUrl;
        image.alt = "Selected photo preview";

        preview.appendChild(image);
    });

    // Enter in name → move to source
    photoName.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            photoSource.focus();
        }
    });

    // Enter in source → upload photo
    photoSource.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            uploadButton.click();
        }
    });

    // Add selected photo to IndexedDB
    uploadButton.addEventListener("click", async () => {
        if (uploadButton.disabled) return;
        if (!selectedFile) {
        await showAppDialog({
            title: "No photo selected",
            message: "Please select a photo before uploading.",
            mode: "alert"
        });
            return;
        }

        const name = photoName.value.trim();
        const source = photoSource.value.trim();

        if (!name || !source) {
            await showAppDialog({
                title: "Missing information",
                message: "Please enter both the photo name and source.",
                mode: "alert"
            });
            return;
        }

        const photo = {
            id: Date.now(),
            name: name,
            date: new Date().toISOString().slice(0, 10),
            source: source,
            image: selectedFile
        };

        uploadButton.disabled = true;

        try {
            await savePhoto(photo);

            photos.push(photo);
            onPhotoAdded();
            closeModal();

            console.log("Photo saved successfully:", photo);
        } catch (error) {
            console.error("Could not save photo:", error);

            await showAppDialog({
                title: "Upload failed",
                message: "Could not save the photo. Please try again.",
                mode: "alert"
            });
        } finally {
            uploadButton.disabled = false;
        }
    });

}
