const PROFILE_KEY = "photospace-profile";

export const defaultProfile = {
    username: "", name: "", email: "", website: "", bio: "",
    location: "", profession: "", privateAccount: false,
    profileImage: "pictures/default-profile.svg"
};

// Profile settings remain local to this browser; gallery photos and notes use Supabase.
export async function getProfile() {
    try { return { ...defaultProfile, ...JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}") }; }
    catch { return { ...defaultProfile }; }
}

export async function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function readImageAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}
