import { supabase, isSupabaseConfigured } from "../supabaseClient.js";

function requireSupabase() {
    if (!isSupabaseConfigured) {
        throw new Error("Supabase is not configured. Add your project URL and publishable key in scripts/config.js.");
    }
    return supabase;
}

function mapPhoto(row) {
    const { data } = supabase.storage.from("photos").getPublicUrl(row.image_path);
    return {
        id: row.id,
        name: row.name,
        source: row.source || "",
        date: row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : "",
        createdAt: row.created_at,
        imagePath: row.image_path,
        url: data.publicUrl,
        notes: []
    };
}

export async function getAllPhotos() {
    const client = requireSupabase();
    const { data, error } = await client
        .from("photos")
        .select("id, name, source, image_path, created_at")
        .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(mapPhoto);
}

export async function savePhoto(photo) {
    const client = requireSupabase();
    if (!(photo.image instanceof Blob)) {
        throw new Error("Select an image file before uploading.");
    }

    const extension = (photo.image.name?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const imagePath = `${crypto.randomUUID()}.${extension || "jpg"}`;
    const { error: uploadError } = await client.storage
        .from("photos")
        .upload(imagePath, photo.image, {
            contentType: photo.image.type || "image/jpeg",
            cacheControl: "3600",
            upsert: false
        });
    if (uploadError) throw uploadError;

    const { data, error } = await client
        .from("photos")
        .insert({ name: photo.name.trim(), source: photo.source.trim(), image_path: imagePath })
        .select("id, name, source, image_path, created_at")
        .single();
    if (error) throw error;
    return mapPhoto(data);
}

export async function getPhotoNotes(photoId) {
    const client = requireSupabase();
    const { data, error } = await client
        .from("photo_notes")
        .select("id, text, created_at")
        .eq("photo_id", photoId)
        .order("created_at", { ascending: true });
    if (error) throw error;
    return (data || []).map(note => ({ ...note, createdAt: note.created_at }));
}

export async function savePhotoNote(photoId, text) {
    const client = requireSupabase();
    const { data, error } = await client
        .from("photo_notes")
        .insert({ photo_id: photoId, text: text.trim() })
        .select("id, text, created_at")
        .single();
    if (error) throw error;
    return { ...data, createdAt: data.created_at };
}
