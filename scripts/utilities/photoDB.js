import { supabase, isSupabaseConfigured } from "../supabaseClient.js";

function client() {
    if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
    return supabase;
}

async function signedUrls(paths, expires = 3600) {
    const uniquePaths = [...new Set(paths.filter(Boolean))];
    if (!uniquePaths.length) return new Map();
    const { data, error } = await client().storage.from("photos").createSignedUrls(uniquePaths, expires);
    if (error) throw error;
    const urls = new Map();
    for (const item of data || []) {
        if (item.error) throw new Error(item.error);
        urls.set(item.path, item.signedUrl);
    }
    return urls;
}

function mapPhoto(row, urls) {
    return {
        id: row.id, ownerId: row.owner_id, name: row.name, source: row.source || "",
        date: row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : "",
        createdAt: row.created_at, imagePath: row.image_path,
        thumbnailPath: row.thumbnail_path || row.image_path,
        url: urls.get(row.image_path),
        thumbnailUrl: urls.get(row.thumbnail_path || row.image_path), notes: []
    };
}

export async function getAllPhotos(ownerId = null, limit = 24, offset = 0) {
    let query = client().from("photos")
        .select("id, owner_id, name, source, image_path, thumbnail_path, created_at")
        .order("created_at", { ascending: false });
    if (ownerId) query = query.eq("owner_id", ownerId);
    if (limit) query = query.range(offset, offset + limit - 1);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    const urls = await signedUrls(rows.flatMap(row => [row.image_path, row.thumbnail_path || row.image_path]));
    return rows.map(row => mapPhoto(row, urls));
}

export async function getPhotoCount(ownerId) {
    const { count, error } = await client().from("photos").select("id", { count: "exact", head: true }).eq("owner_id", ownerId);
    if (error) throw error;
    return count || 0;
}

export async function getPhotoById(photoId) {
    const { data, error } = await client().from("photos")
        .select("id, owner_id, name, source, image_path, thumbnail_path, created_at")
        .eq("id", photoId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const urls = await signedUrls([data.image_path, data.thumbnail_path || data.image_path]);
    return mapPhoto(data, urls);
}

async function reservePath(api, path) {
    const { error } = await api.rpc("reserve_photo_upload", { object_path: path });
    if (error) throw error;
}

export async function savePhoto(photo) {
    const api = client();
    const { data: { user }, error: authError } = await api.auth.getUser();
    if (authError || !user) throw new Error("Sign in before uploading photos.");
    if (!(photo.image instanceof Blob) || !(photo.thumbnail instanceof Blob)) throw new Error("Prepare the image before uploading.");

    const fileId = crypto.randomUUID();
    const fullExtension = photo.image.type === "image/webp" ? "webp" : "jpg";
    const thumbExtension = photo.thumbnail.type === "image/webp" ? "webp" : "jpg";
    const fullPath = `${user.id}/${fileId}.${fullExtension}`;
    const thumbPath = `${user.id}/${fileId}-thumb.${thumbExtension}`;
    await reservePath(api, fullPath);
    await reservePath(api, thumbPath);
    const uploadedPaths = [];
    try {
        for (const [path, file] of [[fullPath, photo.image], [thumbPath, photo.thumbnail]]) {
            const { error } = await api.storage.from("photos").upload(path, file, {
                contentType: file.type, cacheControl: "31536000", upsert: false
            });
            if (error) throw error;
            uploadedPaths.push(path);
        }
        const { data, error } = await api.from("photos").insert({
            owner_id: user.id, name: photo.name.trim(), source: photo.source.trim(),
            image_path: fullPath, thumbnail_path: thumbPath
        }).select("id, owner_id, name, source, image_path, thumbnail_path, created_at").single();
        if (error) throw error;
        const urls = await signedUrls([data.image_path, data.thumbnail_path]);
        return mapPhoto(data, urls);
    } catch (error) {
        if (uploadedPaths.length) await api.storage.from("photos").remove(uploadedPaths);
        throw error;
    }
}

export async function updatePhoto(photoId, { name, source }) {
    const { error } = await client().from("photos").update({ name: name.trim(), source: source.trim() }).eq("id", photoId);
    if (error) throw error;
}

export async function deletePhoto(photo) {
    const api = client();
    const { error: rowError } = await api.from("photos").delete().eq("id", photo.id);
    if (rowError) throw rowError;
    const { error: fileError } = await api.storage.from("photos").remove([photo.imagePath, photo.thumbnailPath].filter(Boolean));
    if (fileError) console.error("Photo removed, but image cleanup failed:", fileError);
}

export async function getPhotoNotes(photoId) {
    const api = client();
    const { data, error } = await api.from("photo_notes")
        .select("id, text, owner_id, created_at").eq("photo_id", photoId).order("created_at");
    if (error) throw error;
    const notes = data || [];
    const authorIds = [...new Set(notes.map(note => note.owner_id).filter(Boolean))];
    let authors = [];
    if (authorIds.length) {
        const { data: profileRows } = await api.from("profiles").select("user_id,username").in("user_id", authorIds);
        authors = profileRows || [];
    }
    const names = new Map(authors.map(profile => [profile.user_id, profile.username]));
    return notes.map(note => ({ ...note, createdAt: note.created_at, username: names.get(note.owner_id) || "member" }));
}

export async function savePhotoNote(photoId, text) {
    const api = client();
    const { data: { user }, error: authError } = await api.auth.getUser();
    if (authError || !user) throw new Error("Sign in to comment.");
    const { data, error } = await api.from("photo_notes").insert({ photo_id: photoId, owner_id: user.id, text: text.trim() })
        .select("id, text, owner_id, created_at").single();
    if (error) throw error;
    return { ...data, createdAt: data.created_at, username: "you" };
}

export async function updateComment(commentId, text) {
    const { error } = await client().from("photo_notes").update({ text: text.trim() }).eq("id", commentId);
    if (error) throw error;
}

export async function deleteComment(commentId) {
    const { error } = await client().from("photo_notes").delete().eq("id", commentId);
    if (error) throw error;
}

export async function getPhotoLikeData(photoId, userId = null) {
    const api = client();
    const [countResult, userResult] = await Promise.all([
        api.from("photo_likes").select("photo_id", { count: "exact", head: true }).eq("photo_id", photoId),
        userId ? api.from("photo_likes").select("photo_id").eq("photo_id", photoId).eq("user_id", userId).maybeSingle() : Promise.resolve({ data: null, error: null })
    ]);
    if (countResult.error) throw countResult.error;
    if (userResult.error) throw userResult.error;
    return { count: countResult.count || 0, liked: Boolean(userResult.data) };
}

export async function togglePhotoLike(photoId, userId, liked) {
    const api = client();
    const result = liked
        ? await api.from("photo_likes").delete().eq("photo_id", photoId).eq("user_id", userId)
        : await api.from("photo_likes").insert({ photo_id: photoId, user_id: userId });
    if (result.error) throw result.error;
}

export async function reportContent(targetType, targetId, reason, details = "") {
    const { data: { user }, error: authError } = await client().auth.getUser();
    if (authError || !user) throw new Error("Sign in to report content.");
    const { error } = await client().from("content_reports").insert({
        reporter_id: user.id, target_type: targetType, target_id: targetId, reason, details: details.trim()
    });
    if (error?.code === "23505") throw new Error("You have already reported this item.");
    if (error) throw error;
}

export async function getOpenReports() {
    const api = client();
    const { data, error } = await api.from("content_reports").select("*").eq("status", "open").order("created_at");
    if (error) throw error;
    return Promise.all((data || []).map(async report => {
        let target = null;
        let ownerId = report.target_id;
        if (report.target_type === "photo") {
            const { data: row } = await api.from("photos").select("name, owner_id, is_hidden").eq("id", report.target_id).maybeSingle();
            target = row;
            ownerId = row?.owner_id;
        } else if (report.target_type === "comment") {
            const { data: row } = await api.from("photo_notes").select("text, owner_id, photo_id, is_hidden").eq("id", report.target_id).maybeSingle();
            target = row;
            if (row?.owner_id) ownerId = row.owner_id;
            if (row?.photo_id) {
                const { data: photo } = await api.from("photos").select("owner_id").eq("id", row.photo_id).maybeSingle();
                if (target) target.photoOwnerId = photo?.owner_id;
            }
        } else {
            const { data: row } = await api.from("profiles").select("username, name, is_hidden").eq("user_id", report.target_id).maybeSingle();
            target = row;
        }
        if (ownerId && report.target_type !== "profile") {
            const { data: owner } = await api.from("profiles").select("username").eq("user_id", ownerId).maybeSingle();
            if (target) target.username = owner?.username;
        }
        return { ...report, target };
    }));
}

export async function isCurrentModerator() {
    const { data, error } = await client().rpc("is_moderator");
    if (error) throw error;
    return Boolean(data);
}

export async function moderateReport(reportId, action) {
    const { error } = await client().rpc("moderate_report", { report_id: reportId, action });
    if (error) throw error;
}
