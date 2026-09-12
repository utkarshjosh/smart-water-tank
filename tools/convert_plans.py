#!/usr/bin/env python3
import os
import re
import glob
import html
from pathlib import Path

WORKSPACE = "/Users/utkarsh.joshi/CODE/smart-water-tank"
PLANS_DIR = os.path.join(WORKSPACE, "plans")

PLANS_METADATA = [
    {
        "file": "plans/solar-power-and-deep-sleep.md",
        "slug": "solar-power-and-deep-sleep",
        "title": "Solar Power & Firmware Deep Sleep Plan",
        "category": "Firmware & Power",
        "status": "Active (P1)",
        "status_type": "active",
        "description": "Plan for firmware deep sleep, fast RTC WiFi reconnection, sensor power gating, and 24/7 solar trickle-charging hardware setup."
    },
    {
        "file": "plans/mqtt-reliability-next-release.md",
        "slug": "mqtt-reliability-next-release",
        "title": "MQTT Wire Contract & Reliability Architecture",
        "category": "Protocol & Reliability",
        "status": "Active",
        "status_type": "active",
        "description": "End-to-end MQTT wire protocol, retention policy, TLS security, device claim verification, and sync mode state machines."
    },
    {
        "file": "plans/unified-tank-config-and-mqtt.md",
        "slug": "unified-tank-config-and-mqtt",
        "title": "Unified Tank Config & Telemetry Schema",
        "category": "Configuration",
        "status": "Active",
        "status_type": "active",
        "description": "Unified tank profile geometry model, local volume calculation fallback, and MQTT telemetry schema integration."
    },
    {
        "file": "plans/split-device-wireless-esp32.md",
        "slug": "split-device-wireless-esp32",
        "title": "Split Wireless Sensor Node Architecture",
        "category": "Hardware & Wireless",
        "status": "Active",
        "status_type": "active",
        "description": "Dual ESP32/ESP8266 split sensor node topology, ESP-NOW peer communication, and distributed power management."
    },
    {
        "file": "plans/first-launch-plan.md",
        "slug": "first-launch-plan",
        "title": "AquaMind Production First Launch Plan",
        "category": "Deployment & Ops",
        "status": "Active",
        "status_type": "active",
        "description": "Production launch checklist, domain routing, SSL/TLS certificate setup, deployment verification, and monitoring."
    },
    {
        "file": "executed_plans/cursor_building_a_custom_library_manage.md",
        "slug": "executed-custom-library-manage",
        "title": "Custom Arduino Library Manager & Build Tooling",
        "category": "Tooling & Build",
        "status": "Executed",
        "status_type": "executed",
        "description": "Custom Arduino CLI library management workflow, local header isolation, and automated firmware Makefile compilation."
    },
    {
        "file": "executed_plans/initial_dev.md",
        "slug": "executed-initial-dev",
        "title": "AquaMind Core Platform Initial Development",
        "category": "Core Platform",
        "status": "Executed",
        "status_type": "executed",
        "description": "Initial system architecture, HTTP REST API endpoints, database schema setup, and ESP8266 prototype firmware."
    },
    {
        "file": "docs/full-code-plan.md",
        "slug": "full-code-plan",
        "title": "Full System Code Plan & Technical Scope",
        "category": "System Architecture",
        "status": "Architecture",
        "status_type": "arch",
        "description": "Comprehensive full-stack architecture specification covering backend microservices, MQTT broker, and firmware layers."
    },
    {
        "file": "docs/lean-plan.md",
        "slug": "lean-plan",
        "title": "Lean MVP Architecture & Scope Plan",
        "category": "MVP Specification",
        "status": "Architecture",
        "status_type": "arch",
        "description": "Minimal viable product scope, essential sensor data flow, basic alerting triggers, and simplified backend data model."
    },
    {
        "file": "docs/major-large-scale-plan.md",
        "slug": "major-large-scale-plan",
        "title": "High-Availability & Scale Architecture Plan",
        "category": "Infrastructure Scale",
        "status": "Architecture",
        "status_type": "arch",
        "description": "Scale-out plan for multi-tenant deployment, load balancer setup, database replication, and high-frequency telemetry caching."
    },
    {
        "file": "docs/web-application-redesign-frd.md",
        "slug": "web-application-redesign-frd",
        "title": "Web Application Redesign Requirements (FRD)",
        "category": "Frontend & UI/UX",
        "status": "P2 Spec",
        "status_type": "arch",
        "description": "Functional requirements document for the v2 web application redesign, Gluestack component system, and live dashboard."
    },
    {
        "file": "docs/aquamind-v1-information-layer-refresh-scope.md",
        "slug": "aquamind-v1-info-layer-refresh",
        "title": "V1 Information Layer Refresh Scope",
        "category": "Data Layer",
        "status": "Architecture",
        "status_type": "arch",
        "description": "Data schema migration, historical measurement aggregation, and real-time telemetry indexing enhancements."
    },
    {
        "file": "docs/aquamind-ai-analytics-architecture.md",
        "slug": "aquamind-ai-analytics-architecture",
        "title": "AI Analytics & Water Consumption Predictor",
        "category": "AI & Analytics",
        "status": "Architecture",
        "status_type": "arch",
        "description": "Predictive machine learning models for household water usage forecasting, leak detection algorithms, and anomaly alerts."
    }
]

HTML_PLAN_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} - AquaMind Plans</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/tokyo-night-dark.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
    <style>
        :root {{
            --bg-primary: #090d16;
            --bg-secondary: #111827;
            --bg-card: rgba(17, 24, 39, 0.7);
            --border-color: rgba(255, 255, 255, 0.08);
            --accent-cyan: #38bdf8;
            --accent-blue: #6366f1;
            --accent-green: #34d399;
            --accent-amber: #fbbf24;
            --text-primary: #f3f4f6;
            --text-secondary: #9ca3af;
            --text-muted: #6b7280;
            --code-bg: #0d1322;
        }}

        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}

        body {{
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            background-color: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.7;
            overflow-x: hidden;
        }}

        /* Header / Navbar */
        .navbar {{
            position: sticky;
            top: 0;
            z-index: 100;
            background: rgba(9, 13, 22, 0.85);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border-bottom: 1px solid var(--border-color);
            padding: 0.85rem 2rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }}

        .nav-left {{
            display: flex;
            align-items: center;
            gap: 1.25rem;
        }}

        .back-btn {{
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            color: var(--text-secondary);
            text-decoration: none;
            font-weight: 600;
            font-size: 0.9rem;
            padding: 0.4rem 0.85rem;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border-color);
            transition: all 0.2s ease;
        }}

        .back-btn:hover {{
            color: var(--accent-cyan);
            background: rgba(56, 189, 248, 0.1);
            border-color: rgba(56, 189, 248, 0.3);
        }}

        .nav-title {{
            font-size: 1.1rem;
            font-weight: 700;
            background: linear-gradient(135deg, #ffffff 0%, var(--accent-cyan) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }}

        .badge {{
            display: inline-flex;
            align-items: center;
            padding: 0.25rem 0.65rem;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 700;
            letter-spacing: 0.03em;
            text-transform: uppercase;
        }}

        .badge-active {{
            background: rgba(56, 189, 248, 0.15);
            color: var(--accent-cyan);
            border: 1px solid rgba(56, 189, 248, 0.3);
        }}

        .badge-executed {{
            background: rgba(52, 211, 153, 0.15);
            color: var(--accent-green);
            border: 1px solid rgba(52, 211, 153, 0.3);
        }}

        .badge-arch {{
            background: rgba(99, 102, 241, 0.15);
            color: var(--accent-blue);
            border: 1px solid rgba(99, 102, 241, 0.3);
        }}

        /* Container Layout */
        .layout {{
            display: flex;
            max-width: 1440px;
            margin: 0 auto;
            padding: 2rem;
            gap: 2.5rem;
        }}

        /* Sidebar TOC */
        .sidebar {{
            width: 280px;
            flex-shrink: 0;
            position: sticky;
            top: 5rem;
            height: calc(100vh - 6rem);
            overflow-y: auto;
            padding-right: 1rem;
        }}

        .sidebar h4 {{
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--text-muted);
            margin-bottom: 1rem;
        }}

        .toc-list {{
            list-style: none;
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
        }}

        .toc-link {{
            color: var(--text-secondary);
            text-decoration: none;
            font-size: 0.88rem;
            font-weight: 500;
            display: block;
            padding: 0.35rem 0.65rem;
            border-radius: 6px;
            transition: all 0.2s ease;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }}

        .toc-link:hover, .toc-link.active {{
            color: var(--accent-cyan);
            background: rgba(56, 189, 248, 0.08);
        }}

        .toc-sub {{
            padding-left: 1rem;
            font-size: 0.82rem;
        }}

        /* Main Content */
        .main-content {{
            flex: 1;
            min-width: 0;
            background: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 3rem;
            box-shadow: 0 20px 40px rgba(0,0,0,0.4);
        }}

        .doc-header {{
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 1.5rem;
            margin-bottom: 2rem;
        }}

        .doc-header h1 {{
            font-size: 2.25rem;
            font-weight: 800;
            line-height: 1.25;
            margin-bottom: 0.75rem;
            color: #ffffff;
        }}

        .doc-meta {{
            display: flex;
            align-items: center;
            gap: 1rem;
            color: var(--text-muted);
            font-size: 0.85rem;
        }}

        /* Markdown Rendered Styling */
        .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 {{
            color: #ffffff;
            font-weight: 700;
            margin-top: 2rem;
            margin-bottom: 1rem;
            scroll-margin-top: 6rem;
        }}

        .markdown-body h1 {{ font-size: 1.75rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem; }}
        .markdown-body h2 {{ font-size: 1.4rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.4rem; }}
        .markdown-body h3 {{ font-size: 1.15rem; }}

        .markdown-body p {{
            margin-bottom: 1.25rem;
            color: #d1d5db;
        }}

        .markdown-body ul, .markdown-body ol {{
            margin-bottom: 1.25rem;
            padding-left: 1.5rem;
            color: #d1d5db;
        }}

        .markdown-body li {{
            margin-bottom: 0.4rem;
        }}

        .markdown-body blockquote {{
            border-left: 4px solid var(--accent-cyan);
            background: rgba(56, 189, 248, 0.05);
            padding: 1rem 1.25rem;
            border-radius: 0 8px 8px 0;
            margin-bottom: 1.5rem;
            color: #e5e7eb;
        }}

        .markdown-body table {{
            width: 100%;
            border-collapse: collapse;
            margin: 1.5rem 0;
            font-size: 0.9rem;
        }}

        .markdown-body th, .markdown-body td {{
            padding: 0.75rem 1rem;
            border: 1px solid var(--border-color);
            text-align: left;
        }}

        .markdown-body th {{
            background: rgba(255, 255, 255, 0.05);
            color: var(--accent-cyan);
            font-weight: 700;
        }}

        .markdown-body tr:nth-child(even) {{
            background: rgba(255, 255, 255, 0.02);
        }}

        .markdown-body code {{
            font-family: 'JetBrains Mono', monospace;
            background: var(--code-bg);
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
            font-size: 0.85em;
            color: var(--accent-cyan);
            border: 1px solid rgba(255, 255, 255, 0.05);
        }}

        .markdown-body pre {{
            background: var(--code-bg);
            border: 1px solid var(--border-color);
            border-radius: 10px;
            padding: 1.25rem;
            overflow-x: auto;
            margin: 1.5rem 0;
        }}

        .markdown-body pre code {{
            background: transparent;
            padding: 0;
            border: none;
            color: inherit;
            font-size: 0.88rem;
        }}

        .mermaid {{
            background: var(--code-bg);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1.5rem;
            display: flex;
            justify-content: center;
            margin: 1.5rem 0;
        }}

        /* Scrollbar */
        ::-webkit-scrollbar {{
            width: 6px;
            height: 6px;
        }}
        ::-webkit-scrollbar-track {{
            background: var(--bg-primary);
        }}
        ::-webkit-scrollbar-thumb {{
            background: rgba(255, 255, 255, 0.15);
            border-radius: 3px;
        }}
        ::-webkit-scrollbar-thumb:hover {{
            background: rgba(255, 255, 255, 0.3);
        }}

        @media (max-width: 1024px) {{
            .sidebar {{ display: none; }}
            .main-content {{ padding: 1.5rem; }}
        }}
    </style>
</head>
<body>

    <nav class="navbar">
        <div class="nav-left">
            <a href="index.html" class="back-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                Plans Hub
            </a>
            <span class="nav-title">{title}</span>
        </div>
        <div>
            <span class="badge badge-{status_type}">{status}</span>
        </div>
    </nav>

    <div class="layout">
        <aside class="sidebar">
            <h4>Table of Contents</h4>
            <ul class="toc-list" id="toc"></ul>
        </aside>

        <main class="main-content">
            <div class="doc-header">
                <h1>{title}</h1>
                <div class="doc-meta">
                    <span>Category: <strong>{category}</strong></span>
                    <span>•</span>
                    <span>Status: <strong>{status}</strong></span>
                </div>
            </div>

            <div id="content" class="markdown-body">
                <!-- Markdown Content rendered here -->
            </div>
        </main>
    </div>

    <script id="raw-markdown" type="text/template">
{raw_markdown}
    </script>

    <script>
        document.addEventListener('DOMContentLoaded', () => {{
            mermaid.initialize({{ startOnLoad: false, theme: 'dark' }});

            const rawMarkdown = document.getElementById('raw-markdown').innerHTML;
            
            // Configure marked
            marked.setOptions({{
                highlight: function(code, lang) {{
                    if (lang && hljs.getLanguage(lang)) {{
                        return hljs.highlight(code, {{ language: lang }}).value;
                    }}
                    return hljs.highlightAuto(code).value;
                }},
                breaks: true
            }});

            const contentEl = document.getElementById('content');
            contentEl.innerHTML = marked.parse(rawMarkdown);

            // Handle Mermaid blocks
            const codeBlocks = contentEl.querySelectorAll('pre code.language-mermaid');
            codeBlocks.forEach((codeBlock, i) => {{
                const pre = codeBlock.parentElement;
                const mermaidDiv = document.createElement('div');
                mermaidDiv.className = 'mermaid';
                mermaidDiv.textContent = codeBlock.textContent;
                pre.replaceWith(mermaidDiv);
            }});

            mermaid.run();

            // Build Table of Contents
            const tocEl = document.getElementById('toc');
            const headings = contentEl.querySelectorAll('h1, h2, h3');
            
            headings.forEach((heading, index) => {{
                const id = 'heading-' + index;
                heading.id = id;

                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = '#' + id;
                a.className = 'toc-link' + (heading.tagName === 'H3' ? ' toc-sub' : '');
                a.textContent = heading.textContent;
                
                li.appendChild(a);
                tocEl.appendChild(li);
            }});

            // Highlight Active TOC link on scroll
            const observer = new IntersectionObserver((entries) => {{
                entries.forEach(entry => {{
                    if (entry.isIntersecting) {{
                        document.querySelectorAll('.toc-link').forEach(link => {{
                            link.classList.toggle('active', link.getAttribute('href') === '#' + entry.target.id);
                        }});
                    }}
                }});
            }}, {{ rootMargin: '-20% 0px -70% 0px' }});

            headings.forEach(heading => observer.observe(heading));
        }});
    </script>
</body>
</html>
"""

INDEX_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AquaMind Architecture & Implementation Plans Hub</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {{
            --bg-primary: #090d16;
            --bg-secondary: #111827;
            --bg-card: rgba(17, 24, 39, 0.7);
            --border-color: rgba(255, 255, 255, 0.08);
            --accent-cyan: #38bdf8;
            --accent-blue: #6366f1;
            --accent-green: #34d399;
            --accent-amber: #fbbf24;
            --text-primary: #f3f4f6;
            --text-secondary: #9ca3af;
            --text-muted: #6b7280;
        }}

        * {{
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }}

        body {{
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            background-color: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.6;
            padding-bottom: 4rem;
        }}

        /* Header Hero */
        .hero {{
            background: radial-gradient(circle at 50% 0%, rgba(56, 189, 248, 0.15) 0%, rgba(9, 13, 22, 0) 70%), var(--bg-secondary);
            border-bottom: 1px solid var(--border-color);
            padding: 4rem 2rem 3rem;
            text-align: center;
        }}

        .hero-title {{
            font-size: 2.75rem;
            font-weight: 800;
            background: linear-gradient(135deg, #ffffff 0%, var(--accent-cyan) 50%, var(--accent-blue) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 0.75rem;
            letter-spacing: -0.02em;
        }}

        .hero-subtitle {{
            color: var(--text-secondary);
            font-size: 1.1rem;
            max-width: 650px;
            margin: 0 auto 2rem;
        }}

        /* Stats Bar */
        .stats-grid {{
            display: flex;
            justify-content: center;
            gap: 1.5rem;
            max-width: 900px;
            margin: 0 auto;
            flex-wrap: wrap;
        }}

        .stat-card {{
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--border-color);
            padding: 1rem 1.75rem;
            border-radius: 12px;
            min-width: 160px;
            backdrop-filter: blur(10px);
        }}

        .stat-value {{
            font-size: 1.75rem;
            font-weight: 800;
            color: #ffffff;
        }}

        .stat-label {{
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--text-muted);
        }}

        /* Main Container */
        .container {{
            max-width: 1280px;
            margin: 2.5rem auto 0;
            padding: 0 2rem;
        }}

        /* Controls (Filter & Search) */
        .controls {{
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 1rem;
            margin-bottom: 2rem;
            flex-wrap: wrap;
        }}

        .filter-tabs {{
            display: flex;
            gap: 0.5rem;
            background: rgba(255, 255, 255, 0.03);
            padding: 0.35rem;
            border-radius: 10px;
            border: 1px solid var(--border-color);
        }}

        .filter-btn {{
            background: transparent;
            border: none;
            color: var(--text-secondary);
            padding: 0.5rem 1rem;
            border-radius: 7px;
            font-size: 0.88rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        }}

        .filter-btn.active, .filter-btn:hover {{
            background: var(--accent-cyan);
            color: #090d16;
        }}

        .search-box {{
            position: relative;
            min-width: 280px;
        }}

        .search-input {{
            width: 100%;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid var(--border-color);
            padding: 0.6rem 1rem 0.6rem 2.5rem;
            border-radius: 10px;
            color: #ffffff;
            font-size: 0.9rem;
            outline: none;
            transition: all 0.2s ease;
        }}

        .search-input:focus {{
            border-color: var(--accent-cyan);
            box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15);
        }}

        .search-icon {{
            position: absolute;
            left: 0.85rem;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-muted);
            pointer-events: none;
        }}

        /* Plan Grid */
        .plan-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
            gap: 1.5rem;
        }}

        .plan-card {{
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 1.75rem;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            transition: all 0.25s ease;
            backdrop-filter: blur(12px);
            text-decoration: none;
            color: inherit;
            position: relative;
            overflow: hidden;
        }}

        .plan-card:hover {{
            transform: translateY(-4px);
            border-color: rgba(56, 189, 248, 0.4);
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(56, 189, 248, 0.1);
        }}

        .card-header {{
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 1rem;
        }}

        .category-tag {{
            font-size: 0.78rem;
            font-weight: 700;
            color: var(--accent-cyan);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }}

        .badge {{
            display: inline-flex;
            align-items: center;
            padding: 0.2rem 0.6rem;
            border-radius: 20px;
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 0.03em;
            text-transform: uppercase;
        }}

        .badge-active {{
            background: rgba(56, 189, 248, 0.15);
            color: var(--accent-cyan);
            border: 1px solid rgba(56, 189, 248, 0.3);
        }}

        .badge-executed {{
            background: rgba(52, 211, 153, 0.15);
            color: var(--accent-green);
            border: 1px solid rgba(52, 211, 153, 0.3);
        }}

        .badge-arch {{
            background: rgba(99, 102, 241, 0.15);
            color: var(--accent-blue);
            border: 1px solid rgba(99, 102, 241, 0.3);
        }}

        .card-title {{
            font-size: 1.25rem;
            font-weight: 700;
            color: #ffffff;
            margin-bottom: 0.65rem;
            line-height: 1.35;
        }}

        .card-desc {{
            color: var(--text-secondary);
            font-size: 0.9rem;
            line-height: 1.55;
            margin-bottom: 1.5rem;
        }}

        .card-footer {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-top: 1px solid var(--border-color);
            padding-top: 1rem;
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--accent-cyan);
        }}

        .view-btn {{
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
        }}

        @media (max-width: 768px) {{
            .hero-title {{ font-size: 2rem; }}
            .plan-grid {{ grid-template-columns: 1fr; }}
            .controls {{ flex-direction: column; align-items: stretch; }}
        }}
    </style>
</head>
<body>

    <header class="hero">
        <h1 class="hero-title">AquaMind Technical Plans Portal</h1>
        <p class="hero-subtitle">Unified index of system architecture, firmware energy plans, protocol contracts, and executed development roadmaps.</p>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">{total_count}</div>
                <div class="stat-label">Total Plans</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: var(--accent-cyan);">{active_count}</div>
                <div class="stat-label">Active (P1/P2)</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: var(--accent-green);">{executed_count}</div>
                <div class="stat-label">Executed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color: var(--accent-blue);">{arch_count}</div>
                <div class="stat-label">Architecture</div>
            </div>
        </div>
    </header>

    <main class="container">
        <div class="controls">
            <div class="filter-tabs">
                <button class="filter-btn active" data-filter="all">All Plans</button>
                <button class="filter-btn" data-filter="active">Active (P1)</button>
                <button class="filter-btn" data-filter="executed">Executed</button>
                <button class="filter-btn" data-filter="arch">Architecture</button>
            </div>

            <div class="search-box">
                <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <input type="text" id="searchInput" class="search-input" placeholder="Search plans by title or tag...">
            </div>
        </div>

        <div class="plan-grid" id="planGrid">
            {plan_cards}
        </div>
    </main>

    <script>
        document.addEventListener('DOMContentLoaded', () => {{
            const searchInput = document.getElementById('searchInput');
            const filterBtns = document.querySelectorAll('.filter-btn');
            const cards = document.querySelectorAll('.plan-card');

            let currentFilter = 'all';

            function filterCards() {{
                const query = searchInput.value.toLowerCase().trim();

                cards.forEach(card => {{
                    const title = card.getAttribute('data-title').toLowerCase();
                    const category = card.getAttribute('data-category').toLowerCase();
                    const statusType = card.getAttribute('data-status-type');

                    const matchesFilter = (currentFilter === 'all' || statusType === currentFilter);
                    const matchesSearch = title.includes(query) || category.includes(query);

                    if (matchesFilter && matchesSearch) {{
                        card.style.display = 'flex';
                    }} else {{
                        card.style.display = 'none';
                    }}
                }});
            }}

            filterBtns.forEach(btn => {{
                btn.addEventListener('click', () => {{
                    filterBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentFilter = btn.getAttribute('data-filter');
                    filterCards();
                }});
            }});

            searchInput.addEventListener('input', filterCards);
        }});
    </script>
</body>
</html>
"""

def generate_plans():
    os.makedirs(PLANS_DIR, exist_ok=True)

    cards_html = []

    active_cnt = 0
    executed_cnt = 0
    arch_cnt = 0

    for plan in PLANS_METADATA:
        src_path = os.path.join(WORKSPACE, plan["file"])
        if not os.path.exists(src_path):
            print(f"Warning: source file {src_path} not found")
            continue

        with open(src_path, "r", encoding="utf-8") as f:
            raw_markdown = f.read()

        html_filename = f"{plan['slug']}.html"
        out_path = os.path.join(PLANS_DIR, html_filename)

        # Count types
        stype = plan["status_type"]
        if stype == "active":
            active_cnt += 1
        elif stype == "executed":
            executed_cnt += 1
        else:
            arch_cnt += 1

        # Render HTML page
        rendered_html = HTML_PLAN_TEMPLATE.format(
            title=html.escape(plan["title"]),
            category=html.escape(plan["category"]),
            status=html.escape(plan["status"]),
            status_type=stype,
            raw_markdown=html.escape(raw_markdown)
        )

        with open(out_path, "w", encoding="utf-8") as f:
            f.write(rendered_html)

        print(f"Converted {plan['file']} -> plans/{html_filename}")

        # Card snippet for Index
        card = f"""
        <a href="{html_filename}" class="plan-card" data-title="{html.escape(plan['title'])}" data-category="{html.escape(plan['category'])}" data-status-type="{stype}">
            <div>
                <div class="card-header">
                    <span class="category-tag">{html.escape(plan['category'])}</span>
                    <span class="badge badge-{stype}">{html.escape(plan['status'])}</span>
                </div>
                <h3 class="card-title">{html.escape(plan['title'])}</h3>
                <p class="card-desc">{html.escape(plan['description'])}</p>
            </div>
            <div class="card-footer">
                <span>View Specification Plan</span>
                <span class="view-btn">
                    Read
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </span>
            </div>
        </a>
        """
        cards_html.append(card)

    # Generate index.html
    index_html = INDEX_HTML_TEMPLATE.format(
        total_count=len(PLANS_METADATA),
        active_count=active_cnt,
        executed_count=executed_cnt,
        arch_count=arch_cnt,
        plan_cards="\n".join(cards_html)
    )

    index_path = os.path.join(PLANS_DIR, "index.html")
    with open(index_path, "w", encoding="utf-8") as f:
        f.write(index_html)

    print(f"Successfully generated plans/index.html with {len(PLANS_METADATA)} plan entries!")

if __name__ == "__main__":
    generate_plans()
