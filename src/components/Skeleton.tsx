export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 rounded-xl ${className}`} />;
}

export function LessonCardSkeleton() {
  return (
    <div className="p-5 rounded-2xl border border-slate-200 bg-white min-h-[170px] flex flex-col justify-between">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <div className="space-y-2 mt-4">
        <Skeleton className="h-3 w-full" />
        <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-7 w-24 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <Skeleton className="h-36 w-full rounded-3xl" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <Skeleton className="h-28 w-full rounded-3xl" />
          <div className="grid grid-cols-2 gap-6">
            <Skeleton className="h-32 rounded-3xl" />
            <Skeleton className="h-32 rounded-3xl" />
          </div>
        </div>
        <div className="lg:col-span-4 space-y-6">
          <Skeleton className="h-48 rounded-3xl" />
          <Skeleton className="h-40 rounded-3xl" />
        </div>
      </div>
    </div>
  );
}

export function AppLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="h-16 bg-white border-b border-slate-200 animate-pulse" />
      <div className="flex-1 flex max-w-7xl mx-auto w-full p-6">
        <div className="w-56 hidden lg:block mr-8">
          <div className="space-y-3 animate-pulse">
            <Skeleton className="h-8 w-full rounded-xl" />
            <Skeleton className="h-8 w-full rounded-xl" />
            <Skeleton className="h-8 w-full rounded-xl" />
          </div>
        </div>
        <div className="flex-1">
          <DashboardSkeleton />
        </div>
      </div>
    </div>
  );
}
