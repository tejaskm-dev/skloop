"use client";

/**
 * Client-side image downscaling, run before anything is uploaded to storage.
 *
 * Without this, whatever came off the user's camera goes straight into Supabase
 * Storage at full resolution — commonly 3-5 MB for a photo that will only ever
 * be rendered into a 40px avatar circle. That costs upload bandwidth, storage
 * (500 MB on the free tier), and egress on every cache miss.
 *
 * next/image resizes on delivery, but it can only work with what it's given:
 * the first request still has to pull the full original through the optimiser.
 * Capping at the source is the cheaper fix, and the two compound.
 */

export interface CompressOptions {
    /** Longest edge, in pixels. */
    maxDimension?: number;
    /** JPEG/WebP quality, 0-1. */
    quality?: number;
    /** Skip files already smaller than this (bytes). */
    skipBelowBytes?: number;
}

/**
 * Returns a downscaled copy of `file`, or the original if compression isn't
 * possible or wouldn't help.
 */
export async function compressImage(
    file: File,
    {
        maxDimension = 1280,
        quality = 0.82,
        skipBelowBytes = 200 * 1024,
    }: CompressOptions = {}
): Promise<File> {
    // Not an image, already small, or an animated GIF (canvas would flatten it).
    if (!file.type.startsWith("image/")) return file;
    if (file.type === "image/gif") return file;
    if (file.size <= skipBelowBytes) return file;

    try {
        const bitmap = await createImageBitmap(file);

        let { width, height } = bitmap;
        if (width > maxDimension || height > maxDimension) {
            if (width >= height) {
                height = Math.round((height / width) * maxDimension);
                width = maxDimension;
            } else {
                width = Math.round((width / height) * maxDimension);
                height = maxDimension;
            }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            bitmap.close();
            return file;
        }

        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        // WebP where supported, JPEG otherwise. Transparency is preserved by WebP;
        // PNGs that fall back to JPEG keep their original file instead.
        const supportsWebp = canvas.toDataURL("image/webp").startsWith("data:image/webp");
        const mime = supportsWebp ? "image/webp" : "image/jpeg";
        const ext = supportsWebp ? ".webp" : ".jpg";

        if (!supportsWebp && file.type === "image/png") return file;

        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, mime, quality)
        );

        if (!blob || blob.size >= file.size) return file; // no gain, keep original

        return new File([blob], file.name.replace(/\.[^/.]+$/, "") + ext, { type: mime });
    } catch {
        // createImageBitmap/canvas unavailable or the file is malformed.
        return file;
    }
}
