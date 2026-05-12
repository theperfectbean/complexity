import { NextResponse } from "next/server";
import { FLEET_NODES, FLEET_CONTAINERS } from "@/lib/topology";
import { requireUser } from "@/lib/auth-server";

export async function GET() {
  const authResult = await requireUser();
  if (authResult instanceof NextResponse) return authResult;

  return NextResponse.json({
    nodes: FLEET_NODES,
    containers: FLEET_CONTAINERS,
    timestamp: new Date().toISOString()
  });
}
