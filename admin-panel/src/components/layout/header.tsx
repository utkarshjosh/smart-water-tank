"use client";

import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { UserNav } from "@/components/layout/user-nav";
import { ModeToggle } from "@/components/mode-toggle"; // We need to create this

export function Header() {
    return (
        <div className="border-b">
            <div className="flex h-16 items-center px-4">
                <MobileSidebar />
                <div className="ml-auto flex items-center space-x-4">
                    <ModeToggle />
                    <UserNav />
                </div>
            </div>
        </div>
    );
}
