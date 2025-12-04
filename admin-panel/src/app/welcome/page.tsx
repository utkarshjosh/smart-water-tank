'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Droplets, Activity, ShieldCheck, Zap, BarChart3, Waves, Smartphone, Download, ArrowRight, Info } from 'lucide-react';
import GlassTank from '@/components/GlassTank';

export default function LandingPage() {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 500], [0, 200]);
  const y2 = useTransform(scrollY, [0, 500], [0, -150]);

  // Simulation State
  const [tankLevel, setTankLevel] = useState(84);
  const [alert, setAlert] = useState<string | null>(null);

  const simulateLeak = () => {
    setAlert('leak');
    setTankLevel((prev: number) => Math.max(0, prev - 10));
  };

  const simulateFill = () => {
    setAlert('filling');
    setTankLevel((prev: number) => Math.min(100, prev + 15));
    setTimeout(() => setAlert(null), 3000);
  };

  const simulateLow = () => {
    setAlert('low');
    setTankLevel(15);
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-white overflow-hidden relative selection:bg-cyan-500/30">
      {/* Background Gradients - Deep Aquatic Blues */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/40 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-teal-900/30 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '12s', animationDelay: '2s' }} />
        <div className="absolute top-[40%] left-[30%] w-[30%] h-[30%] bg-cyan-900/20 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '10s', animationDelay: '1s' }} />
      </div>

      {/* Glass Overlay Texture */}
      <div className="fixed inset-0 bg-[url('/noise.svg')] opacity-[0.03] pointer-events-none mix-blend-overlay"></div>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 px-6 py-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl px-6 py-4 shadow-lg ring-1 ring-white/5">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg shadow-inner">
              <Droplets className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
              AquaMind
            </span>
          </div>
          <div className="hidden md:flex gap-8 text-sm font-medium text-slate-300">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#analytics" className="hover:text-white transition-colors">Analytics</a>
            <a href="#about" className="hover:text-white transition-colors">About</a>
          </div>
          <button className="px-5 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-sm font-medium transition-all hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            <span>Get App</span>
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              AI-Powered Water Intelligence
            </div>
            <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6 tracking-tight">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-cyan-100 to-blue-200">
                Clarity in Every Drop
              </span>
            </h1>
            <p className="text-lg text-slate-400 mb-8 leading-relaxed max-w-lg">
              Experience the weightlessness of total control. Our edge AI understands your water usage patterns, predicting needs before they arise.
            </p>
            <div className="flex flex-wrap gap-4">
              <button className="px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-semibold shadow-[0_0_40px_rgba(6,182,212,0.4)] hover:shadow-[0_0_60px_rgba(6,182,212,0.6)] transition-all hover:scale-[1.02] flex items-center gap-3">
                <Download className="w-5 h-5" />
                Download Android App
              </button>
            </div>
          </motion.div>

          <motion.div
            style={{ y: y1 }}
            className="relative"
          >
            {/* Main Glass Card - Dashboard Preview */}
            <div className="relative z-10 bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-2xl border border-white/20 rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-sm text-slate-400 uppercase tracking-wider">Live Status</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`w-2 h-2 rounded-full ${alert === 'leak' ? 'bg-red-500 animate-ping' : 'bg-green-500'}`} />
                    <span className="text-sm font-medium text-slate-200">
                      {alert === 'leak' ? 'Leak Detected' : 'System Normal'}
                    </span>
                  </div>
                </div>
                <div className="p-3 bg-cyan-500/20 rounded-xl">
                  <Waves className="w-6 h-6 text-cyan-400" />
                </div>
              </div>

              {/* Animated Glass Tank */}
              <div className="mb-8 py-4">
                <GlassTank level={tankLevel} alert={alert} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <div className="text-xs text-slate-400 mb-1">Daily Usage</div>
                  <div className="text-xl font-semibold">1,240 L</div>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <div className="text-xs text-slate-400 mb-1">Prediction</div>
                  <div className="text-xl font-semibold text-green-400">Normal</div>
                </div>
              </div>

              {/* Simulation Controls */}
              <div className="mt-6 pt-6 border-t border-white/10">
                <div className="text-xs text-slate-400 mb-3 uppercase tracking-wider">Simulation Controls</div>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={simulateLeak}
                    className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs rounded-lg border border-red-500/30 transition-colors"
                  >
                    Leak
                  </button>
                  <button
                    onClick={simulateFill}
                    className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 text-xs rounded-lg border border-blue-500/30 transition-colors"
                  >
                    Fill
                  </button>
                  <button
                    onClick={simulateLow}
                    className="px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 text-xs rounded-lg border border-yellow-500/30 transition-colors"
                  >
                    Low
                  </button>
                </div>
              </div>
            </div>

            {/* Floating Elements */}
            <motion.div
              animate={{ y: [0, -20, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-10 -right-10 bg-white/10 backdrop-blur-xl border border-white/20 p-4 rounded-2xl shadow-xl z-20"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <ShieldCheck className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <div className="text-xs text-slate-300">System Status</div>
                  <div className="text-sm font-semibold">Protected</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-32 px-6 relative z-10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">Transparent Intelligence</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Our edge device processes data locally, giving you instant insights without latency.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <Activity className="w-8 h-8 text-blue-400" />,
                title: "Pattern Recognition",
                desc: "AI learns your daily habits to optimize water storage and reduce wastage."
              },
              {
                icon: <ShieldCheck className="w-8 h-8 text-teal-400" />,
                title: "Leak Prevention",
                desc: "Instant alerts for seepage or abnormal flow rates, protecting your home."
              },
              {
                icon: <BarChart3 className="w-8 h-8 text-cyan-400" />,
                title: "Smart Forecasting",
                desc: "Predictive analytics tell you exactly how much water you'll need tomorrow."
              }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                className="group p-8 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all hover:-translate-y-2"
              >
                <div className="mb-6 p-4 bg-white/5 rounded-2xl w-fit group-hover:bg-white/10 transition-colors">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold mb-4">{feature.title}</h3>
                <p className="text-slate-400 leading-relaxed">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Analytics Section */}
      <section id="analytics" className="py-32 px-6 relative z-10 bg-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-5xl font-bold mb-6">Deep Dive Analytics</h2>
              <p className="text-slate-400 mb-8 leading-relaxed">
                Understand your consumption like never before. Our advanced analytics dashboard provides granular insights into your water usage patterns, helping you save water and money.
              </p>

              <div className="space-y-6">
                {[
                  { label: "Weekly Average", value: "840 L", trend: "-12%", trendColor: "text-green-400" },
                  { label: "Peak Usage Time", value: "8:00 AM", trend: "Normal", trendColor: "text-slate-400" },
                  { label: "Estimated Savings", value: "$45/mo", trend: "+5%", trendColor: "text-green-400" }
                ].map((stat, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-slate-300">{stat.label}</span>
                    <div className="text-right">
                      <div className="font-bold text-xl">{stat.value}</div>
                      <div className={`text-xs ${stat.trendColor}`}>{stat.trend}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              {/* Mock Analytics Dashboard */}
              <div className="bg-[#0f172a] rounded-3xl border border-white/10 p-6 shadow-2xl relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5" />

                <div className="flex justify-between items-center mb-8 relative z-10">
                  <h3 className="font-bold text-lg">Usage Trends</h3>
                  <select className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-sm text-slate-300 outline-none">
                    <option>This Week</option>
                    <option>This Month</option>
                  </select>
                </div>

                {/* Mock Chart Area */}
                <div className="h-64 flex items-end justify-between gap-3 relative z-10 px-4 pb-2">
                  {/* Grid Lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                    <div className="w-full h-[1px] bg-white" />
                    <div className="w-full h-[1px] bg-white" />
                    <div className="w-full h-[1px] bg-white" />
                    <div className="w-full h-[1px] bg-white" />
                  </div>

                  {[30, 45, 25, 60, 75, 50, 40].map((h, i) => (
                    <div key={i} className="w-full h-full flex items-end relative group">
                      {/* Bar Background */}
                      <div className="absolute bottom-0 w-full h-full bg-white/5 rounded-t-lg" />

                      {/* Active Bar */}
                      <motion.div
                        initial={{ height: 0 }}
                        whileInView={{ height: `${h}%` }}
                        transition={{ duration: 1, delay: i * 0.1 }}
                        className="w-full bg-gradient-to-t from-cyan-500 to-blue-500 rounded-t-lg relative z-10 group-hover:from-cyan-400 group-hover:to-blue-400 transition-colors shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                      >
                        {/* Top Glow */}
                        <div className="absolute top-0 left-0 w-full h-1 bg-white/50" />
                      </motion.div>

                      {/* Tooltip */}
                      <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-[#1e293b] border border-white/20 px-3 py-1.5 rounded-lg text-xs font-bold opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 z-20 whitespace-nowrap shadow-xl">
                        {h * 10} Liters
                        <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-[#1e293b] border-r border-b border-white/20 transform rotate-45" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-4 text-xs text-slate-500">
                  <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                </div>
              </div>

              {/* Floating Log Card */}
              <motion.div
                initial={{ x: 50, opacity: 0 }}
                whileInView={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="absolute -bottom-10 -right-10 bg-[#1e293b] p-6 rounded-2xl border border-white/10 shadow-xl max-w-xs"
              >
                <h4 className="text-sm font-semibold text-slate-300 mb-4">Recent Activity</h4>
                <div className="space-y-4">
                  {[
                    { event: "Pump Started", time: "2 mins ago", icon: Zap, color: "text-yellow-400" },
                    { event: "Leak Check Passed", time: "1 hour ago", icon: ShieldCheck, color: "text-green-400" }
                  ].map((log, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg bg-white/5 ${log.color}`}>
                        <log.icon size={14} />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{log.event}</div>
                        <div className="text-xs text-slate-500">{log.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="about" className="py-32 px-6 scroll-mt-32">
        <div className="max-w-5xl mx-auto relative">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 to-blue-600/20 blur-3xl rounded-full" />
          <div className="relative bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[3rem] p-12 md:p-20 text-center overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50" />

            <h2 className="text-4xl md:text-6xl font-bold mb-8 tracking-tight">
              Ready to see clearly?
            </h2>
            <p className="text-xl text-slate-300 mb-12 max-w-2xl mx-auto">
              Join thousands of smart homes that have switched to intelligent water management.
            </p>
            <button className="inline-flex items-center justify-center px-10 py-5 bg-white text-slate-900 rounded-full font-bold text-lg hover:bg-cyan-50 transition-colors shadow-[0_0_30px_rgba(255,255,255,0.3)] gap-3">
              <Download className="w-5 h-5" />
              Download Android App
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <section className="border-t border-white/10 py-12 px-6 bg-[#0f172a]/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 text-slate-500 text-sm">
          <div className="flex flex-col gap-2">
            <span>© 2024 AquaMind. All rights reserved.</span>
            <span className="flex items-center gap-1">
              Designed by <a href="https://UtkarshJoshi.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 transition-colors">UtkarshJoshi</a>
            </span>
          </div>
          <div className="flex gap-8">
            <a href="#" className="hover:text-slate-300 transition-colors">Privacy</a>
            <a href="#" className="hover:text-slate-300 transition-colors">Terms</a>
            <a href="#" className="hover:text-slate-300 transition-colors">Contact</a>
          </div>
        </div>
      </section>
    </div>
  );
}
