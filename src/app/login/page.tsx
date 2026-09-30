import { Suspense } from "react";
import { AuthForm } from "@/components/shop/AuthForm";
import { BackButton } from "@/components/shop/BackButton";

export default function LoginPage() {
  return (
    <main className="flex-1 w-full">
      <div className="mx-auto w-full max-w-6xl px-4 md:px-6 pt-5">
        <BackButton label="Back to shop" />
      </div>
      <div className="grid place-items-center px-4 py-10 md:py-16">
        <Suspense>
          <AuthForm mode="login" />
        </Suspense>
      </div>
    </main>
  );
}
