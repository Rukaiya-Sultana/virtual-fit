import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { getStorage } from "@/lib/storage/fs-storage";
import { runCleanup } from "@/lib/cleanup";
import { listGarments } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const storage = getStorage();
  let storageWritable = true;
  try {
    await storage.ensureLayout();
    const probe = storage.resolveSafe("temp/.health");
    await fs.writeFile(probe, "ok");
    await fs.rm(probe, { force: true });
  } catch {
    storageWritable = false;
  }
  const garments = await listGarments();

  return NextResponse.json({
    status: storageWritable ? "ok" : "degraded",
    storage: { root: storage.root(), writable: storageWritable },
    garments: garments.length,
    ai: process.env.OPENROUTER_API_KEY ? "llm+local" : "local",
    time: new Date().toISOString(),
  });
}
