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
          <div className="w-full max-w-sm space-y-8">
            <div className="mx-auto h-14 w-14 animate-pulse rounded-2xl border border-surface1 bg-mantle" />
            <div className="panel h-56 animate-pulse" />
          </div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
