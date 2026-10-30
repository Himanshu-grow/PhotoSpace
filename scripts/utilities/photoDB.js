import { supabase, isSupabaseConfigured } from "../supabaseClient.js";

function client() {
    if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
    return supabase;
}

function mapPhoto(row) {
    const { data } = supabase.storage.from("photos").getPublicUrl(row.image_path);
    return {
        id: row.id,
        ownerId: row.owner_id,
        name: row.name,
        source: row.source || "",
        date: row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : "",
        createdAt: row.created_at,
        imagePath: row.image_path,
        url: data.publicUrl,
        notes: []
    };
}

export async function getAllPhotos(ownerId = null, limit = null) {
    let query = client().from("photos")
        .select("id, owner_id, name, source, image_path, created_at")
        .order("created_at", { ascending: false });
    if (ownerId) query = query.eq("owner_id", ownerId);
    if (limit) query = query.limit(limit);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(mapPhoto);
}

export async function savePhoto(photo) {
    const api = client();
    const { data: authData, error: authError } = await api.auth.getUser();
    if (authError || !authData.user) throw new Error("Sign in before uploading photos.");
    if (!(photo.image instanceof Blob)) throw new Error("Select an image file before uploading.");

    const extension = (photo.image.name?.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const imagePath = `${authData.user.id}/${crypto.randomUUID()}.${extension || "jpg"}`;
    const { error: uploadError } = await api.storage.from("photos").upload(imagePath, photo.image, {
        contentType: photo.image.type || "image/jpeg", cacheControl: "3600", upsert: false
    });
    if (uploadError) throw uploadError;

    const { data, error } = await api.from("photos")
        .insert({ owner_id: authData.user.id, name: photo.name.trim(), source: photo.source.trim(), image_path: imagePath })
        .select("id, owner_id, name, source, image_path, created_at")
        .single();
    if (error) throw error;
    return mapPhoto(data);
}

export async function deletePhoto(photo) {
    const api = client();
    const { error: rowError } = await api.from("photos").delete().eq("id", photo.id);
    if (rowError) throw rowError;
    const { error: fileError } = await api.storage.from("photos").remove([photo.imagePath]);
    if (fileError) console.error("Photo record removed, but image cleanup failed:", fileError);
}

export async function getPhotoNotes(photoId) {
    const { data, error } = await client().from("photo_notes")
        .select("id, text, owner_id, created_at").eq("photo_id", photoId).order("created_at");
    if (error) throw error;
    return (data || []).map(note => ({ ...note, createdAt: note.created_at }));
}

export async function savePhotoNote(photoId, text) {
    const api = client();
    const { data: authData, error: authError } = await api.auth.getUser();
    if (authError || !authData.user) throw new Error("Sign in to add a note.");
    const { data, error } = await api.from("photo_notes")
        .insert({ photo_id: photoId, owner_id: authData.user.id, text: text.trim() })
        .select("id, text, owner_id, created_at").single();
    if (error) throw error;
    return { ...data, createdAt: data.created_at };
}
