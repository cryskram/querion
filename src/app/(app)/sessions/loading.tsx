import { Skeleton } from "@/components/Skeleton";

export default function LoadingSessions() {
  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_1fr] lg:gap-8">
      <aside className="space-y-4">
        <div className="panel p-4">
          <Skeleton className="h-3 w-16" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="stat">
                <Skeleton className="h-2.5 w-14" />
                <Skeleton className="mt-2 h-4 w-10" />
              </div>
            ))}
          </div>
        </div>
        <div className="panel p-4">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="mt-3 h-9 w-full rounded-xl" />
          <Skeleton className="mt-2.5 h-8 w-full rounded-xl" />
        </div>
        <div className="panel space-y-2 p-4">
          <Skeleton className="h-3 w-16" />
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-6 w-full rounded-lg" />
          ))}
        </div>
      </aside>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3.5 w-16" />
        </div>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="panel space-y-3.5 p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <div className="flex gap-2 border-t border-surface0/70 pt-3">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-10" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
