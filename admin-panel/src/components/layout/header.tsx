"use client";

import { lazy, Suspense } from "react";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";

const ModeToggle = lazy(() =>
    import("@/components/mode-toggle").then((module) => ({ default: module.ModeToggle }))
);
const UserNav = lazy(() =>
    import("@/components/layout/user-nav").then((module) => ({ default: module.UserNav }))
);

export function Header() {
    return (
        <div className="border-b">
            <div className="flex h-16 items-center px-4">
                <MobileSidebar />
                <div className="ml-auto flex items-center space-x-4">
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
