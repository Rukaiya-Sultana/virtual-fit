import type { Metadata } from "next";
import { Suspense } from "react";
import { TryOnStudio } from "@/components/tryon/TryOnStudio";

export const metadata: Metadata = {
  title: "Fitting Room",
  description:
    "Upload a photo, browse the catalog, and try garments on with body-aware geometric fitting.",
};

export default function TryOnPage() {
  return (
    <Suspense fallback={null}>
      <TryOnStudio />
    </Suspense>
  );
}
