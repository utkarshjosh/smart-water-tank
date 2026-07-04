"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { SidebarDrawer } from "@/components/layout/sidebar-drawer";

export const MobileSidebar = () => {
    const [isMounted, setIsMounted] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return null;
    }

    return (
        <>
            <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white md:hidden"
                aria-label="Open navigation menu"
                aria-expanded={open}
                onClick={() => setOpen(true)}
            >
                <Menu className="h-5 w-5" />
            </button>
            <SidebarDrawer open={open} onClose={() => setOpen(false)} title="Admin navigation">
                <Sidebar onNavigate={() => setOpen(false)} />
            </SidebarDrawer>
        </>
    );
};
