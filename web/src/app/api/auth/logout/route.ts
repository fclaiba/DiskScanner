import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin, clientIp } from "@/server/http";
import { SESSION_COOKIE, deleteSessionByToken, getSessionUser } from "@/server/auth/sessions";
import { audit } from "@/server/audit";
import { env } from "@/server/env";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: { code: "forbidden", message: "Cross-site request blocked." } }, { status: 403 });
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    const s = await getSessionUser(token);
    await deleteSessionByToken(token);
    if (s) await audit("auth.logout", s.user.id, {}, clientIp(req.headers));
  }
  const res = NextResponse.redirect(`${env.siteUrl}/login?signed_out=1`, 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
