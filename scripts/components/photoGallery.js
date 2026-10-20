
import { photos } from "../data/photos.js";

const photoGrid = document.querySelector("#photo-grid");

let galleryObjectURLs = [];

export function renderPhotos() {
    photoGrid.innerHTML = "";

    // Release temporary image URLs from the previous render.
    galleryObjectURLs.forEach((url) => {
        URL.revokeObjectURL(url);
    });

    galleryObjectURLs = [];

    if (photos.length === 0) {
        const message = document.createElement("div");
        message.className = "empty-message";
        message.textContent = "No photos yet. Add your first photo!";
        photoGrid.appendChild(message);
        return;
    }

    photos.forEach((photo) => {
        const image = document.createElement("img");

        if (photo.image instanceof Blob) {
            const imageURL = URL.createObjectURL(photo.image);
            galleryObjectURLs.push(imageURL);
            image.src = imageURL;
        } else {
            image.src = photo.url;
        }

        image.alt = photo.name;
        image.title = `${photo.name} — ${photo.date}`;
        image.dataset.photoId = photo.id;

        photoGrid.appendChild(image);
    });
}
