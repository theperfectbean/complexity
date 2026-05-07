import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireUser } from "@/lib/auth-server";

export async function GET() {
  const session = await auth();
  const dbUserResult = await requireUser();
  
  let dbUser = null;
  if (!(dbUserResult instanceof NextResponse)) {
    dbUser = dbUserResult.user;
  }

  return NextResponse.json({
    session: session ? {
      user: {
        id: session.user?.id,
        email: session.user?.email,
        name: session.user?.name,
        isAdmin: session.user?.isAdmin,
      }
    } : null,
    dbUser: dbUser ? {
      id: dbUser.id,
      email: dbUser.email,
    } : null,
    match: session?.user?.id === dbUser?.id
  });
}
