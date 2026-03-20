import { NextResponse } from "next/server";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { encrypt, decrypt } from "@/lib/encryption";
import { z } from "zod";

/** GET  — generate a new TOTP secret and QR code URI (does NOT save yet) */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user] = await db.select({ id: users.id, email: users.email, totpEnabled: users.totpEnabled })
    .from(users).where(eq(users.email, session.user.email)).limit(1);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (user.totpEnabled) {
    return NextResponse.json({ error: "2FA is already enabled" }, { status: 409 });
  }

  const secret = generateSecret();
  const otpauth = generateURI({ label: user.email, issuer: "Complexity", secret });
  const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

  return NextResponse.json({ secret, qrCodeDataUrl });
}

/** POST — verify a code against the provided secret, then enable TOTP */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = z.object({ secret: z.string().min(16), code: z.string().length(6) }).safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const isValid = verifySync({ token: body.data.code, secret: body.data.secret });
  if (!isValid) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

  const encryptedSecret = encrypt(body.data.secret);
  await db.update(users)
    .set({ totpSecret: encryptedSecret, totpEnabled: true })
    .where(eq(users.email, session.user.email));

  return NextResponse.json({ ok: true });
}

/** DELETE — disable TOTP (requires password confirmation) */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = z.object({ code: z.string().length(6) }).safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "code required" }, { status: 400 });

  const [user] = await db.select({ totpSecret: users.totpSecret, totpEnabled: users.totpEnabled })
    .from(users).where(eq(users.email, session.user.email)).limit(1);
  if (!user?.totpEnabled || !user.totpSecret) {
    return NextResponse.json({ error: "2FA is not enabled" }, { status: 409 });
  }

  let secret = user.totpSecret;
  try { secret = decrypt(user.totpSecret); } catch { /* raw */ }

  const isValid = verifySync({ token: body.data.code, secret });
  if (!isValid) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

  await db.update(users).set({ totpSecret: null, totpEnabled: false }).where(eq(users.email, session.user.email));
  return NextResponse.json({ ok: true });
}
