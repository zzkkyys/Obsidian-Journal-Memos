/**
 * Shared path-related constants and utilities.
 */

/** Matches common image file extensions (without query/hash/alias suffixes). */
export const IMAGE_FILE_EXT_REGEX = /\.(?:png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)$/i;

/** Returns `true` if the path looks like an image file (strips alias/query/hash before testing). */
export function looksLikeImageFile(path: string): boolean {
    const normalized = (path.split("|")[0]?.split("#")[0]?.split("?")[0] ?? "").trim();
    return IMAGE_FILE_EXT_REGEX.test(normalized);
}

/** Extracts the filename (last segment) from a path. */
export function fileNameFromPath(path: string): string {
    const normalized = String(path ?? "").replace(/\\/g, "/");
    const segments = normalized.split("/");
    const name = (segments.length > 0 ? segments[segments.length - 1] ?? "" : "").trim();
    return name || path;
}
