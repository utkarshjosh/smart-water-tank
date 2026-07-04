"use client";

import { TenantMobileSidebar } from "@/components/layout/tenant-mobile-sidebar";
import { UserNav } from "@/components/layout/user-nav";
import { ModeToggle } from "@/components/mode-toggle";

export function TenantHeader({ tenantName }: { tenantName?: string }) {
    return (
        <div className="border-b">
            <div className="flex h-16 items-center px-4">
                <TenantMobileSidebar />
                {tenantName && (
                    <span className="ml-4 text-sm font-medium text-muted-foreground hidden md:inline">
                        {tenantName}
                    </span>
                )}
                <div className="ml-auto flex items-center space-x-4">
                    <ModeToggle />
                    <UserNav />
                </div>
            </div>
        </div>
    );
}
