
const DB_NAME = "PhotoSpaceDB";
const STORE_NAME = "photos";
const DB_VERSION = 2;

export function openPhotoDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains("profiles")) {
                db.createObjectStore("profiles", { keyPath: "id" });
            }
        };

        request.onsuccess = () => {
            const db = request.result;

            // Close the connection if another part of the app
            // requests a database upgrade.
            db.onversionchange = () => db.close();

            resolve(db);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

export async function getAllPhotos() {
    const db = await openPhotoDB();

    return new Promise((resolve, reject) => {
        let result;

        const transaction = db.transaction(
            STORE_NAME,
            "readonly"
        );

        const request = transaction
            .objectStore(STORE_NAME)
            .getAll();

        request.onsuccess = () => {
            result = request.result;
        };

        transaction.oncomplete = () => {
            db.close();
            resolve(result);
        };

        transaction.onerror = () => {
            db.close();
            reject(transaction.error || request.error);
        };

        transaction.onabort = () => {
            db.close();
            reject(transaction.error || request.error);
        };
    });
}

export async function savePhoto(photo) {
    const db = await openPhotoDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            STORE_NAME,
            "readwrite"
        );

        transaction.objectStore(STORE_NAME).put(photo);

        transaction.oncomplete = () => {
            db.close();
            resolve();
        };

        transaction.onerror = () => {
            db.close();
            reject(transaction.error);
        };

        transaction.onabort = () => {
            db.close();
            reject(transaction.error);
        };
    });
}

export async function deletePhoto(id) {
    const db = await openPhotoDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            STORE_NAME,
            "readwrite"
        );

        transaction.objectStore(STORE_NAME).delete(id);

        transaction.oncomplete = () => {
            db.close();
            resolve();
        };

        transaction.onerror = () => {
            db.close();
            reject(transaction.error);
        };

        transaction.onabort = () => {
            db.close();
            reject(transaction.error);
        };
    });
}
