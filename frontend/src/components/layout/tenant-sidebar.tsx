import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Monitor, PlusCircle } from "lucide-react";

const routes = [
    {
        label: "Dashboard",
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
        <div className="flex h-full flex-col bg-slate-950 py-3 text-white">
            <div className="flex-1 px-2">
                <Link to="/app/devices" className="mb-8 flex h-11 items-center rounded-lg px-2" onClick={onNavigate}>
                    <div className="relative mr-3 h-7 w-7 flex-shrink-0">
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
                    <h1 className="text-base font-semibold">
                        AquaMind
                    </h1>
                </Link>
                <div className="space-y-0.5">
                    {routes.map((route) => (
                        <Link
                            key={route.href}
                            to={route.href}
                            onClick={onNavigate}
                            className={cn(
                                "group flex h-10 w-full cursor-pointer items-center justify-start rounded-md px-2.5 text-sm font-medium transition hover:bg-white/10 hover:text-white",
                                pathname.startsWith(route.href) ? "bg-white/10 text-white" : "text-slate-400"
                            )}
                        >
                            <div className="flex items-center flex-1">
                                <route.icon className={cn("mr-3 h-4 w-4", route.color)} />
                                {route.label}
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
