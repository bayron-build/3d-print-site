// The product-photos bucket is public: objects are served from a
// predictable CDN URL, no signing. Usable from server and client
// components (NEXT_PUBLIC_ env vars are inlined client-side).

export function productPhotoUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-photos/${path}`;
}
