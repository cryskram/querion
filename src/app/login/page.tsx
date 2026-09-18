import { Suspense } from "react";
import LoginForm from "@/components/LoginForm";

export const metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center px-4">
          <div className="h-40 w-full max-w-sm animate-pulse rounded-2xl border border-surface2 bg-mantle/60" />
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
