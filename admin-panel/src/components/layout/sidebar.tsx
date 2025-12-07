"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Monitor,
    FileCode,
    BarChart3,
    Users,
    Building2,
    LogOut,
    Settings,
} from "lucide-react";
import Image from "next/image";

const routes = [
    {
        label: "Dashboard",
        icon: LayoutDashboard,
        href: "/admin/dashboard",
        color: "text-sky-500",
    },
    {
        label: "Devices",
        icon: Monitor,
        href: "/admin/devices",
        color: "text-violet-500",
    },
    {
        label: "Firmware",
        icon: FileCode,
        href: "/admin/firmware",
        color: "text-pink-700",
    },
    {
        label: "Tenants",
        icon: Building2,
        href: "/admin/tenants",
        color: "text-orange-700",
    },
    {
        label: "Analytics",
        icon: BarChart3,
        href: "/admin/analytics",
        color: "text-emerald-500",
    },
];

export function Sidebar() {
    const pathname = usePathname();
    const [imageError, setImageError] = useState(false);

    return (
        <div className="space-y-4 py-4 flex flex-col h-full bg-slate-900 text-white">
            <div className="px-3 py-2 flex-1">
                <Link href="/admin/dashboard" className="flex items-center pl-3 mb-14">
                    <div className="relative w-8 h-8 mr-4 flex-shrink-0">
                        {!imageError ? (
                            <Image
                                src="/logo.png"
                                alt="AquaMind Logo"
                                fill
                                className="object-contain"
                                onError={() => setImageError(true)}
                                priority
                            />
                        ) : (
                            <div className="flex items-center justify-center w-full h-full bg-primary rounded-full">
                                <span className="font-bold text-white text-sm">A</span>
                            </div>
                        )}
                    </div>
                    <h1 className="text-xl font-bold">
                        AquaMind
                    </h1>
                </Link>
                <div className="space-y-1">
                    {routes.map((route) => (
                        <Link
                            key={route.href}
                            href={route.href}
                            className={cn(
                                "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-white hover:bg-white/10 rounded-lg transition",
                                pathname?.startsWith(route.href) ? "text-white bg-white/10" : "text-zinc-400"
                            )}
                        >
                            <div className="flex items-center flex-1">
                                <route.icon className={cn("h-5 w-5 mr-3", route.color)} />
                                {route.label}
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
            <div className="px-3 py-2">
                <div className="text-xs text-zinc-500 text-center mb-2">v2.0.0</div>
            </div>
        </div>
    );
}
