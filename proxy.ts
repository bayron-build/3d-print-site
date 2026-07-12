import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next 16 renamed the `middleware` file convention to `proxy`
// (https://nextjs.org/docs/messages/middleware-to-proxy). Runs before
// every matched request; its only job is keeping auth cookies fresh.
export default async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Everything except static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
