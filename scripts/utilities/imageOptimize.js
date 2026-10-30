export async function optimizeImage(file, maxDimension = 2560, quality = 0.84) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    let blob = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error("Image optimization failed.")), "image/webp", quality));
    if (blob.type !== "image/webp") {
        blob = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error("Image optimization failed.")), "image/jpeg", quality));
    }
    const extension = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `photospace-image.${extension}`, { type: blob.type });
}
