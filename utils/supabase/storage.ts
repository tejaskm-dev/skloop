import { createClient } from "./client";
import { compressImage } from "@/lib/image-compress";

/**
 * Uploads an image to a Supabase bucket and returns the public URL.
 * @param bucket - The storage bucket (e.g., 'avatars', 'banners').
 * @param path - The file path/name within the bucket.
 * @param imageSource - Can be a File, Blob, or a data URL (base64) / Blob URL.
 */
export async function uploadProfileImage(
    bucket: "avatars" | "banners",
    path: string,
    imageSource: File | Blob | string
): Promise<string | null> {
    const supabase = createClient();

    let body: File | Blob;

    if (typeof imageSource === "string") {
        if (imageSource.startsWith("data:")) {
            // Convert base64 to Blob
            const res = await fetch(imageSource);
            body = await res.blob();
        } else if (imageSource.startsWith("blob:")) {
            // Fetch the blob from the blob URL
            const res = await fetch(imageSource);
            body = await res.blob();
        } else {
            // If it's already a URL, return it
            return imageSource;
        }
    } else {
        body = imageSource;
    }

    // Downscale before upload. Avatars and banners render at at most a few
    // hundred pixels, but the raw file off a phone camera is routinely several
    // megabytes — which then costs storage and egress on every cache miss.
    if (body instanceof File) {
        body = await compressImage(body, {
            maxDimension: bucket === "banners" ? 1600 : 512,
            quality: 0.85,
        });
    }

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
        .from(bucket)
        .upload(path, body, {
            upsert: true,
            contentType: body.type || 'image/jpeg',
        });

    if (error) {
        console.error(`Error uploading to ${bucket}:`, error);
        throw new Error(`Upload to ${bucket} failed: ${error.message}`);
    }

    // Get Public URL
    const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);

    return publicUrl;
}
