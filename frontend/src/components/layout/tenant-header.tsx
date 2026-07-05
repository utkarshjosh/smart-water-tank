import { lazy, Suspense } from "react";
import { TenantMobileSidebar } from "@/components/layout/tenant-mobile-sidebar";

const ModeToggle = lazy(() =>
    import("@/components/mode-toggle").then((module) => ({ default: module.ModeToggle }))
);
const UserNav = lazy(() =>
    import("@/components/layout/user-nav").then((module) => ({ default: module.UserNav }))
);

export function TenantHeader({ tenantName }: { tenantName?: string }) {
    return (
        <div className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
            <div className="flex h-14 items-center px-4 sm:px-6 lg:px-7">
                <TenantMobileSidebar />
                {tenantName && (
                    <span className="ml-1 hidden text-sm font-medium text-muted-foreground md:inline">
                        {tenantName}
                    </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <Suspense fallback={<div className="h-9 w-9 rounded-md border" aria-hidden="true" />}>
                        <ModeToggle />
                    </Suspense>
                    <Suspense fallback={<div className="h-8 w-8 rounded-full bg-muted" aria-hidden="true" />}>
                        <UserNav />
                    </Suspense>
                </div>
            </div>
        </div>
    );
}
