'use client';

import { motion } from 'framer-motion';

interface GlassTankProps {
    level: number;
    alert: string | null;
}

export default function GlassTank({ level, alert }: GlassTankProps) {
    // Determine color based on alert state
    const liquidColor = alert === 'leak' ? 'from-red-500/80 to-red-600/90' :
        alert === 'low' ? 'from-yellow-500/80 to-yellow-600/90' :
            'from-cyan-500/80 to-blue-600/90';

    const surfaceColor = alert === 'leak' ? 'bg-red-400/50' :
        alert === 'low' ? 'bg-yellow-400/50' :
            'bg-cyan-300/50';

    return (
        <div className="relative w-64 h-80 mx-auto perspective-[1000px] group">
            {/* Cylinder Container */}
            <div className="relative w-full h-full">

                {/* --- Back Layer (Behind Water) --- */}
                {/* Tank Back Wall */}
                <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-r from-white/10 via-white/5 to-white/10 backdrop-blur-[2px] border-x border-white/20"
                    style={{ clipPath: 'inset(0 0 0 0 round 2rem)' }}>
                    {/* Ribs Pattern (Back) */}
                    <div className="absolute inset-0 opacity-20"
                        style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.5) 40px, rgba(255,255,255,0.5) 41px)' }} />
                </div>

                {/* --- Water Column --- */}
                <div className="absolute bottom-4 left-2 right-2 top-4 rounded-[1.8rem] overflow-hidden z-10">
                    {/* Liquid Body */}
                    <motion.div
                        initial={{ height: '0%' }}
                        animate={{ height: `${level}%` }}
                        transition={{ type: "spring", damping: 20, stiffness: 50 }}
                        className="absolute bottom-0 w-full"
                    >
                        <div className={`w-full h-full bg-gradient-to-r ${liquidColor} backdrop-blur-sm transition-colors duration-500`}>
                            {/* Internal Volume Shadow/Highlight */}
                            <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-white/20" />
                        </div>

                        {/* Water Surface (Meniscus) */}
                        <div className="absolute top-0 left-0 w-full h-8 -translate-y-1/2 perspective-[500px]">
                            <motion.div
                                animate={{ scale: [1, 1.02, 1], rotateX: [0, 2, 0] }}
                                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                                className={`w-full h-full rounded-[50%] ${surfaceColor} border border-white/30 shadow-[inset_0_0_10px_rgba(255,255,255,0.5)] backdrop-blur-md`}
                            >
                                {/* Surface Reflection */}
                                <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 bg-white/40 rounded-[50%] blur-sm" />
                            </motion.div>
                        </div>
                    </motion.div>
                </div>

                {/* --- Front Layer (Over Water) --- */}
                {/* Tank Front Wall (Glass Effect) */}
                <div className="absolute inset-0 rounded-[2rem] border border-white/30 z-20 pointer-events-none overflow-hidden shadow-[inset_0_0_40px_rgba(255,255,255,0.1)]">
                    {/* Ribs Pattern (Front - Stronger) */}
                    <div className="absolute inset-0 opacity-30 mix-blend-overlay"
                        style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.8) 40px, rgba(255,255,255,0.8) 42px)' }} />

                    {/* Specular Highlights (Cylinder Shine) */}
                    <div className="absolute top-0 left-4 w-12 h-full bg-gradient-to-r from-white/20 to-transparent blur-md" />
                    <div className="absolute top-0 right-8 w-4 h-full bg-gradient-to-r from-transparent to-white/30 blur-sm" />

                    {/* Top Rim */}
                    <div className="absolute top-0 left-0 w-full h-12 border-b border-white/20 bg-gradient-to-b from-white/10 to-transparent rounded-t-[2rem]" />
                </div>

                {/* Top Opening (Lid Area) */}
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-white/10 border border-white/30 rounded-[50%] shadow-lg backdrop-blur-md z-30">
                    <div className="absolute inset-2 border border-white/20 rounded-[50%]" />
                </div>

                {/* Measurement Ticks */}
                <div className="absolute -right-6 top-10 bottom-10 flex flex-col justify-between py-2 z-20">
                    {[100, 75, 50, 25, 0].map((mark) => (
                        <div key={mark} className="flex items-center gap-2 justify-end opacity-60">
                            <span className="text-[10px] text-slate-300 font-mono">{mark}</span>
                            <div className="w-2 h-[1px] bg-slate-300" />
                        </div>
                    ))}
                </div>

            </div>

            {/* Level Text Overlay */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-40 text-5xl font-bold text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)] mix-blend-overlay">
                {Math.round(level)}<span className="text-2xl opacity-80">%</span>
            </div>
        </div>
    );
}
