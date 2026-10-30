import { supabase } from "./supabaseClient.js";
import { optimizeImage } from "./utilities/imageOptimize.js";

export const defaultProfile = {
    user_id: "", username: "", name: "", bio: "", profile_image_path: null, is_private: false,
    profileImage: "pictures/default-profile.svg"
};

function mapProfile(profile, images = new Map()) {
    if (!profile) return { ...defaultProfile };
    const image = images.get(profile.profile_image_path) || defaultProfile.profileImage;
    return { ...defaultProfile, ...profile, profileImage: image || defaultProfile.profileImage };
}

async function mapProfiles(rows) {
    const paths = [...new Set(rows.map(row => row.profile_image_path).filter(Boolean))];
    const images = new Map();
    if (paths.length) {
        const { data, error } = await supabase.storage.from("photos").createSignedUrls(paths, 3600);
        if (!error) for (const item of data || []) if (!item.error) images.set(item.path, item.signedUrl);
    }
    return rows.map(row => mapProfile(row, images));
}

export async function getProfile(userId) {
    const { data, error } = await supabase.from("profiles")
        .select("user_id, username, name, bio, profile_image_path, is_private, created_at")
        .eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return (await mapProfiles([data]))[0];
}

export async function getProfiles(search = "") {
    let query = supabase.from("profiles")
        .select("user_id, username, name, bio, profile_image_path, is_private, created_at")
        .order("created_at", { ascending: false }).limit(60);
    if (search.trim()) {
        const term = search.trim().replace(/[^\p{L}\p{N}_ -]/gu, "");
        if (!term) return [];
        query = query.or(`username.ilike.%${term}%,name.ilike.%${term}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return mapProfiles(data || []);
}

export async function saveProfile(profile) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw new Error("Sign in to edit your profile.");
    const previousImagePath = profile.profile_image_path;
    const values = {
        username: profile.username.trim().toLowerCase(),
        name: profile.name.trim(),
        bio: profile.bio.trim(),
        profile_image_path: profile.profile_image_path || null,
        is_private: Boolean(profile.is_private),
        updated_at: new Date().toISOString()
    };
    // Profiles are created by the auth signup trigger. Updating the existing
    // row avoids requiring INSERT grants just to edit a profile.
    const { data, error } = await supabase.from("profiles").update(values)
        .eq("user_id", authData.user.id)
        .select("user_id, username, name, bio, profile_image_path, is_private, created_at").single();
    if (error) throw error;
    if (previousImagePath && previousImagePath !== data.profile_image_path) {
        const { error: cleanupError } = await supabase.storage.from("photos").remove([previousImagePath]);
        if (cleanupError) console.error("Old profile picture could not be removed:", cleanupError);
    }
    return (await mapProfiles([data]))[0];
}

export async function uploadProfileImage(file) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw new Error("Sign in to change your profile picture.");
    const optimized = await optimizeImage(file, 512, 0.8);
    const extension = optimized.type === "image/webp" ? "webp" : "jpg";
    const path = `${authData.user.id}/avatar-${crypto.randomUUID()}.${extension}`;
    const { error: reservationError } = await supabase.rpc("reserve_photo_upload", { object_path: path });
    if (reservationError) throw reservationError;
    const { error } = await supabase.storage.from("photos").upload(path, optimized, {
        contentType: optimized.type, cacheControl: "31536000", upsert: false
    });
    if (error) throw error;
    return path;
}
