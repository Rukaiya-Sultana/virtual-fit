import { NextResponse } from "next/server";
import { listGarments } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  const garments = await listGarments();
  return NextResponse.json(
    {
      garments: garments.map((g) => ({
        id: g.id,
        name: g.name,
        category: g.category,
        color: g.color,
        colorHex: g.colorHex,
        fit: g.fit,
        sleeve: g.sleeve,
        style: g.style,
        formality: g.formality,
        occasions: g.occasions,
        lengthFactor: g.lengthFactor,
        assetPath: g.assetPath,
        thumbnailPath: g.thumbnailPath,
        width: g.width,
        height: g.height,
        anchors: g.anchors,
        price: g.price,
        description: g.description,
        sizes: g.sizes,
        badge: g.badge,
        stock: g.stock,
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
