"use client";

import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Monitor, PlusCircle } from "lucide-react";

const routes = [
    {
        label: "My Devices",
        icon: Monitor,
        href: "/app/devices",
        color: "text-sky-500",
    },
    {
        label: "Add Device",
        icon: PlusCircle,
        href: "/app/onboarding",
        color: "text-emerald-500",
    },
];

export function TenantSidebar({ onNavigate }: { onNavigate?: () => void }) {
    const pathname = useLocation().pathname;
    const [imageError, setImageError] = useState(false);

    return (
        <div className="space-y-4 py-4 flex flex-col h-full bg-slate-900 text-white">
            <div className="px-3 py-2 flex-1">
                <Link to="/app/devices" className="flex items-center pl-3 mb-14" onClick={onNavigate}>
                    <div className="relative w-8 h-8 mr-4 flex-shrink-0">
                        {!imageError ? (
                            <img
                                src="/logo.png"
                                alt="AquaMind Logo"
                                className="h-full w-full object-contain"
                                onError={() => setImageError(true)}
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
                            to={route.href}
                            onClick={onNavigate}
                            className={cn(
                                "text-sm group flex p-3 w-full justify-start font-medium cursor-pointer hover:text-white hover:bg-white/10 rounded-lg transition",
                                pathname.startsWith(route.href) ? "text-white bg-white/10" : "text-zinc-400"
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
        </div>
    );
}
