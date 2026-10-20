import { openPhotoDB } from "./utilities/photoDB.js";

const PROFILE_ID = "default-profile";

export const defaultProfile = {
    username: "", name: "", email: "", website: "", bio: "",
    location: "", profession: "", privateAccount: false,
    profileImage: "pictures/default-profile.svg"
};

// IndexedDB persists profile edits across browser restarts without localStorage.
export async function getProfile() {
    const db = await openPhotoDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("profiles", "readonly");
        const request = transaction.objectStore("profiles").get(PROFILE_ID);
        let savedProfile;
        request.onsuccess = () => { savedProfile = request.result?.data; };
        transaction.oncomplete = () => { db.close(); resolve({ ...defaultProfile, ...(savedProfile || {}) }); };
        transaction.onerror = () => { db.close(); reject(transaction.error || request.error); };
        transaction.onabort = () => { db.close(); reject(transaction.error || request.error); };
    });
}

export async function saveProfile(profile) {
    const db = await openPhotoDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction("profiles", "readwrite");
        transaction.objectStore("profiles").put({ id: PROFILE_ID, data: profile });
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => { db.close(); reject(transaction.error); };
        transaction.onabort = () => { db.close(); reject(transaction.error); };
    });
}

export function readImageAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}
