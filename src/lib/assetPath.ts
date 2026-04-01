import { desktopApi } from "@/lib/desktopApi";

function encodeRelativeAssetPath(relativePath: string): string {
	return relativePath
		.replace(/^\/+/, "")
		.split("/")
		.filter(Boolean)
		.map((part) => encodeURIComponent(part))
		.join("/");
}

function ensureTrailingSlash(value: string): string {
	return value.endsWith("/") ? value : `${value}/`;
}

export async function getAssetPath(relativePath: string): Promise<string> {
	const encodedRelativePath = encodeRelativeAssetPath(relativePath);

	try {
		if (typeof window !== "undefined") {
			// If running in a dev server (http/https), prefer the web-served path
			if (
				window.location &&
				window.location.protocol &&
				window.location.protocol.startsWith("http")
			) {
				return `/${encodedRelativePath}`;
			}

			const base = await desktopApi.getAssetBasePath();
			if (base) {
				return new URL(encodedRelativePath, ensureTrailingSlash(base)).toString();
			}

			// Fallback for file:// protocol: use relative path from index.html
			// This is needed for E2E tests where getAssetBasePath might not be available
			if (window.location && window.location.protocol === "file:" && window.location.pathname) {
				const basePath = window.location.pathname.substring(
					0,
					window.location.pathname.lastIndexOf("/"),
				);
				return `file://${basePath}/${encodedRelativePath}`;
			}
		}
	} catch {
		// ignore and use fallback
	}

	// Fallback for web/dev server: public/wallpapers are served at '/wallpapers/...'
	return `/${encodedRelativePath}`;
}

export default getAssetPath;
