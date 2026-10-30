import { supabase } from "./supabaseClient.js";

export const defaultProfile = {
    user_id: "", username: "", name: "", bio: "", profile_image_path: null,
    profileImage: "pictures/default-profile.svg"
};

function mapProfile(profile) {
    if (!profile) return { ...defaultProfile };
    const image = profile.profile_image_path
        ? supabase.storage.from("photos").getPublicUrl(profile.profile_image_path).data.publicUrl
        : defaultProfile.profileImage;
    return { ...defaultProfile, ...profile, profileImage: image };
}

export async function getProfile(userId) {
    const { data, error } = await supabase.from("profiles")
        .select("user_id, username, name, bio, profile_image_path, created_at")
        .eq("user_id", userId).maybeSingle();
    if (error) throw error;
    return mapProfile(data);
}

export async function getProfiles(search = "") {
    let query = supabase.from("profiles")
        .select("user_id, username, name, bio, profile_image_path, created_at")
        .order("created_at", { ascending: false }).limit(60);
    if (search.trim()) {
        const term = search.trim().replace(/[,%()]/g, "");
        query = query.or(`username.ilike.%${term}%,name.ilike.%${term}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(mapProfile);
}

export async function saveProfile(profile) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw new Error("Sign in to edit your profile.");
    const values = {
        user_id: authData.user.id,
        username: profile.username.trim().toLowerCase(),
        name: profile.name.trim(),
        bio: profile.bio.trim(),
        profile_image_path: profile.profile_image_path || null,
        updated_at: new Date().toISOString()
    };
    const { data, error } = await supabase.from("profiles").upsert(values)
        .select("user_id, username, name, bio, profile_image_path, created_at").single();
    if (error) throw error;
    return mapProfile(data);
}

export async function uploadProfileImage(file) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw new Error("Sign in to change your profile picture.");
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${authData.user.id}/avatar-${crypto.randomUUID()}.${extension || "jpg"}`;
    const { error } = await supabase.storage.from("photos").upload(path, file, {
        contentType: file.type, cacheControl: "3600", upsert: false
    });
    if (error) throw error;
    return path;
}
