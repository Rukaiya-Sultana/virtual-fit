import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGarment, listGarments } from "@/lib/catalog";
import { SiteFooter } from "@/components/shop/SiteHeader";
import { PurchasePanel } from "@/components/shop/PurchasePanel";
import { ProductCard } from "@/components/shop/ProductCard";
import { Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  tshirt: "T-Shirt",
  polo: "Polo",
  shirt: "Shirt",
  sweatshirt: "Sweatshirt",
  hoodie: "Hoodie",
  jacket: "Jacket",
};

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const g = await getGarment(params.id);
  if (!g) return { title: "Product not found" };
  return {
    title: g.name,
    description:
      g.description ??
      `${g.name} — ${g.color} ${CATEGORY_LABEL[g.category] ?? g.category}. Try it on virtually in your browser.`,
  };
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  const garment = await getGarment(params.id);
  if (!garment) notFound();

  const all = await listGarments();
  const related = all
    .filter((g) => g.id !== garment.id && g.category === garment.category)
    .slice(0, 4);
  const fallback = all.filter((g) => g.id !== garment.id && !related.some((r) => r.id === g.id)).slice(0, 4 - related.length);
  const relatedProducts = [...related, ...fallback];

  return (
    <div className="flex-1 flex flex-col">

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 md:px-6 py-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 mb-6">
          <a href="/" className="focus-ring rounded hover:text-zinc-200">Shop</a>
          <span className="mx-1.5 text-zinc-700">/</span>
          <span>{CATEGORY_LABEL[garment.category] ?? garment.category}</span>
          <span className="mx-1.5 text-zinc-700">/</span>
          <span className="text-zinc-300">{garment.name}</span>
        </nav>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-14">
          {/* Image */}
          <div className="rounded-2xl border border-line bg-surface-raised/60 overflow-hidden sticky top-24 self-start">
            <div
              className="aspect-[4/5] grid place-items-center p-10"
              style={{
                background:
                  "radial-gradient(120% 90% at 50% 15%, rgba(255,255,255,0.06), transparent 60%)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/assets/${garment.assetPath}`}
                alt={garment.name}
                className="max-h-full max-w-full object-contain drop-shadow-[0_24px_40px_rgba(0,0,0,0.5)]"
              />
            </div>
            <div className="px-5 py-3 border-t border-line flex items-center justify-between text-[11px] text-zinc-500">
              <span>Studio render · {garment.width}×{garment.height}</span>
              <span>Anchor-calibrated for the fitting engine</span>
            </div>
          </div>

          {/* Details */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                {CATEGORY_LABEL[garment.category] ?? garment.category}
              </span>
              {garment.badge && (
                <Badge tone={garment.badge === "new" ? "accent" : "default"}>
                  {garment.badge}
                </Badge>
              )}
            </div>

            <h1 className="mt-2.5 text-3xl md:text-4xl font-semibold text-white">
              {garment.name}
            </h1>

            {garment.price !== undefined && (
              <p className="mt-3 text-xl text-zinc-300 tabular-nums">
                ${garment.price}
              </p>
            )}

            {garment.description && (
              <p className="mt-5 text-sm leading-relaxed text-zinc-400 max-w-lg">
                {garment.description}
              </p>
            )}

            <div className="my-7 border-t border-line" />

            <PurchasePanel garment={garment} />

            <div className="my-7 border-t border-line" />

            {/* Metadata */}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-zinc-500">Color</dt>
                <dd className="mt-0.5 text-zinc-200 flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full border border-zinc-600"
                    style={{ backgroundColor: garment.colorHex }}
                    aria-hidden
                  />
                  {garment.color}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Cut</dt>
                <dd className="mt-0.5 text-zinc-200">{garment.fit} fit · {garment.sleeve} sleeve</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Formality</dt>
                <dd className="mt-0.5 text-zinc-200">
                  {"●".repeat(garment.formality)}
                  <span className="text-zinc-700">{"●".repeat(5 - garment.formality)}</span>
                  <span className="ml-1.5 text-xs text-zinc-500">{garment.formality}/5</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Style</dt>
                <dd className="mt-0.5 text-zinc-200">{garment.style.join(", ")}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-zinc-500">Works for</dt>
                <dd className="mt-0.5 text-zinc-200">{garment.occasions.join(" · ")}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Related */}
        {relatedProducts.length > 0 && (
          <section className="mt-16">
            <h2 className="text-lg font-semibold text-white mb-5">You might also like</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {relatedProducts.map((g) => (
                <ProductCard key={g.id} garment={g} />
              ))}
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
