import Link from "next/link";
import { listGarments } from "@/lib/catalog";
import { SiteFooter } from "@/components/shop/SiteHeader";
import { ShopGrid } from "@/components/shop/ShopGrid";

export const dynamic = "force-dynamic";

const HOW = [
  {
    n: "01",
    title: "Pick a piece",
    body: "Browse the collection like any store — every product here is real data the fitting engine understands.",
  },
  {
    n: "02",
    title: "Try it on",
    body: "One tap takes you to the fitting room with the garment preloaded. Your photo is analyzed in your browser; nothing uploads.",
  },
  {
    n: "03",
    title: "Buy with confidence",
    body: "See the fit — regular, slim or oversized — before you check out. Ask the AI assistant if you're torn between two.",
  },
];

export default async function ShopHome() {
  const garments = await listGarments();
  const hero = garments.find((g) => g.id === "blue-hoodie") ?? garments[0];
  const heroB = garments.find((g) => g.id === "white-dress-shirt") ?? garments[1];
  const heroC = garments.find((g) => g.id === "denim-trucker-jacket") ?? garments[2];

  return (
    <div className="flex-1 flex flex-col">
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-line">
          <div
            aria-hidden
            className="absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(900px 420px at 70% -10%, rgba(201,242,77,0.07), transparent 60%), radial-gradient(700px 500px at 5% 110%, rgba(96,130,255,0.06), transparent 60%)",
            }}
          />
          <div className="relative mx-auto max-w-6xl px-6 py-16 md:py-24 grid md:grid-cols-[1.05fr_0.95fr] gap-12 items-center">
            <div>
              <p className="text-xs font-medium tracking-[0.28em] uppercase text-accent mb-5">
                A store with a fitting room
              </p>
              <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] text-white max-w-xl">
                Wear it before you buy it.
              </h1>
              <p className="mt-6 text-lg text-zinc-400 max-w-lg leading-relaxed">
                Every product in this store can be tried on in seconds — right in
                your browser. Body-aware fitting, honest prices, zero upload of
                your photo.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link
                  href="#collection"
                  className="focus-ring rounded-lg bg-accent px-6 py-3 font-semibold text-zinc-950 hover:bg-accent-dim transition-colors"
                >
                  Shop the collection
                </Link>
                <Link
                  href="/tryon"
                  className="focus-ring rounded-lg border border-line px-6 py-3 text-zinc-300 hover:border-zinc-500 transition-colors"
                >
                  Open the fitting room
                </Link>
              </div>
              <p className="mt-6 text-xs text-zinc-500">
                {garments.length} pieces · {new Set(garments.map((g) => g.category)).size} categories · all try-on-able
              </p>
            </div>

            <div className="hidden md:flex items-end justify-center gap-4">
              {hero && (
                <div className="rotate-[-4deg] translate-y-4 rounded-xl border border-line bg-surface-raised p-3 shadow-stage">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/assets/${hero.thumbnailPath}`}
                    alt={hero.name}
                    className="w-32 rounded-lg"
                  />
                </div>
              )}
              {heroB && (
                <div className="rounded-xl border border-line bg-surface-raised p-3 shadow-stage">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/assets/${heroB.thumbnailPath}`}
                    alt={heroB.name}
                    className="w-40 rounded-lg"
                  />
                </div>
              )}
              {heroC && (
                <div className="rotate-[5deg] translate-y-8 rounded-xl border border-line bg-surface-raised p-3 shadow-stage">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/assets/${heroC.thumbnailPath}`}
                    alt={heroC.name}
                    className="w-32 rounded-lg"
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Collection */}
        <section id="collection" className="border-b border-line scroll-mt-16">
          <div className="mx-auto max-w-6xl px-6 py-14">
            <div className="flex items-end justify-between mb-8">
              <div>
                <h2 className="text-2xl md:text-3xl font-semibold text-white">
                  The collection
                </h2>
                <p className="mt-1.5 text-sm text-zinc-500">
                  Hover any piece for a shortcut into the fitting room.
                </p>
              </div>
            </div>
            <ShopGrid garments={garments} />
          </div>
        </section>

        {/* How it works */}
        <section className="bg-surface-raised/40 border-b border-line">
          <div className="mx-auto max-w-6xl px-6 py-14">
            <h2 className="text-2xl md:text-3xl font-semibold text-white">
              How Virtual Fit shopping works
            </h2>
            <div className="mt-8 grid md:grid-cols-3 gap-8">
              {HOW.map((s) => (
                <div key={s.n} className="border-t-2 border-line pt-5">
                  <span className="text-xs font-semibold tracking-[0.3em] text-accent">
                    {s.n}
                  </span>
                  <h3 className="mt-3 text-lg font-medium text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
