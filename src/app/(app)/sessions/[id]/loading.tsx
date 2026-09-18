import { Skeleton } from "@/components/Skeleton";

export default function LoadingSession() {
  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex items-center justify-between border-b border-surface0/80 pb-3">
        <Skeleton className="h-7 w-24 rounded-xl" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-32 rounded-xl" />
          <Skeleton className="h-7 w-20 rounded-xl" />
        </div>
      </div>

      <div className="panel space-y-5 p-5 sm:p-6">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-32 rounded-full" />
        </div>
        <Skeleton className="h-6 w-3/4" />
        <div className="grid grid-cols-2 gap-4 border-t border-surface0/70 pt-4 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-2.5 w-12" />
              <Skeleton className="h-3.5 w-20" />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-3.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="panel space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-md" />
              <Skeleton className="h-3 w-28" />
              <Skeleton className="ml-auto h-3 w-24" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
