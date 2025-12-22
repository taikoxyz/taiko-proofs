const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

export function buildApiUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined>
) {
  const origin =
    typeof window === "undefined" ? "http://localhost" : window.location.origin;
  const base = API_BASE_URL ? API_BASE_URL.replace(/\/$/, "") + "/" : origin + "/";
  const trimmedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(trimmedPath, base);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}
