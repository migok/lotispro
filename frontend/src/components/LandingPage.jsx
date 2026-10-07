import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "../landing.css";

/* ─── LOGO ───────────────────────────────────────────────────────────── */
const LogoIcon = ({ size = 28 }) => (
  <svg width={size} height={Math.round(size * 1.14)} viewBox="0 0 28 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14 1C7.925 1 3 5.925 3 12c0 8.25 11 19 11 19S25 20.25 25 12C25 5.925 20.075 1 14 1z"
      fill="var(--lp-brass)"
      fillOpacity="0.15"
      stroke="var(--lp-brass)"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <rect x="8.5" y="7" width="5" height="3.5" rx="0.75" fill="var(--lp-brass)" fillOpacity="0.9"/>
    <rect x="15" y="7" width="5" height="3.5" rx="0.75" fill="var(--lp-brass)" fillOpacity="0.9"/>
    <rect x="8.5" y="11.5" width="5" height="3.5" rx="0.75" fill="var(--lp-brass)" fillOpacity="0.55"/>
    <rect x="15" y="11.5" width="5" height="3.5" rx="0.75" fill="var(--lp-brass)" fillOpacity="0.55"/>
  </svg>
);

/* ─── SVG ICONS ─────────────────────────────────────────────────────── */
const IconCheck = ({ className = "" }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconShield = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const IconUser = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const IconClient = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" /><path d="M20 21a8 8 0 1 0-16 0" />
  </svg>
);

export default function LandingPage() {
  const canvasRef = useRef(null);
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const [lpTheme, setLpTheme] = useState(
    () => localStorage.getItem("lp-theme") || "dark"
  );

  const toggleTheme = () => {
    setLpTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem("lp-theme", next);
      return next;
    });
  };

  /* ── Google Fonts injection ── */
  useEffect(() => {
    const existing = document.getElementById("lp-fonts");
    if (existing) return;
    const link = document.createElement("link");
    link.id = "lp-fonts";
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400;1,600&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);
  }, []);

  /* ── Body cursor ── */
  useEffect(() => {
    const prev = document.body.style.cursor;
    document.body.style.cursor = "none";
    return () => { document.body.style.cursor = prev; };
  }, []);

  /* ── Custom cursor ── */
  useEffect(() => {
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;
    let mouseX = 0, mouseY = 0, ringX = 0, ringY = 0, rafId;
    const onMove = (e) => {
      mouseX = e.clientX; mouseY = e.clientY;
      dot.style.left = mouseX + "px"; dot.style.top = mouseY + "px";
    };
    const animate = () => {
      ringX += (mouseX - ringX) * 0.12;
      ringY += (mouseY - ringY) * 0.12;
      ring.style.left = ringX + "px"; ring.style.top = ringY + "px";
      rafId = requestAnimationFrame(animate);
    };
    const onEnter = () => ring.classList.add("expanded");
    const onLeave = () => ring.classList.remove("expanded");
    document.addEventListener("mousemove", onMove);
    document.querySelectorAll("a, button").forEach((el) => {
      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);
    });
    rafId = requestAnimationFrame(animate);
    return () => {
      document.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  /* ── Canvas animated lot grid ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let W, H, lots = [], mouse = { x: -999, y: -999 }, rafId;

    const buildLots = () => {
      lots = [];
      const cols = Math.ceil(W / 80) + 2, rows = Math.ceil(H / 60) + 2;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          lots.push({
            x: c * 80 - 40, y: r * 60 - 30,
            w: 60 + Math.random() * 20, h: 44 + Math.random() * 14,
            alpha: 0.08 + Math.random() * 0.12,
            phase: Math.random() * Math.PI * 2,
            speed: 0.0004 + Math.random() * 0.0006,
          });
    };
    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      buildLots();
    };
    const draw = (t) => {
      ctx.clearRect(0, 0, W, H);
      lots.forEach((l) => {
        const dist = Math.hypot(mouse.x - l.x - l.w / 2, mouse.y - l.y - l.h / 2);
        const hover = Math.max(0, 1 - dist / 200);
        const a = l.alpha + hover * 0.25 + Math.sin(t * l.speed + l.phase) * 0.03;
        ctx.strokeStyle = `rgba(212,151,58,${a})`;
        ctx.lineWidth = 0.5 + hover * 1.5;
        ctx.strokeRect(l.x, l.y, l.w, l.h);
        if (hover > 0.3) {
          ctx.fillStyle = `rgba(212,151,58,${hover * 0.05})`;
          ctx.fillRect(l.x, l.y, l.w, l.h);
        }
      });
      rafId = requestAnimationFrame(draw);
    };
    const onMouse = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    window.addEventListener("mousemove", onMouse);
    window.addEventListener("resize", resize);
    resize();
    rafId = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  /* ── Scroll & intersection effects ── */
  useEffect(() => {
    // Nav scroll
    const nav = document.getElementById("lp-nav");
    const onScroll = () => nav?.classList.toggle("scrolled", window.scrollY > 40);
    window.addEventListener("scroll", onScroll);

    // Hero elements
    const heroIds = ["lp-hero-eyebrow", "lp-hero-title", "lp-hero-sub", "lp-hero-actions", "lp-hero-visual"];
    heroIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) setTimeout(() => el.classList.add("visible"), 120);
    });

    // Reveal on scroll
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.1, rootMargin: "0px 0px -60px 0px" }
    );
    document.querySelectorAll(".lp-reveal").forEach((el) => io.observe(el));

    // Counter animation
    const counterObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target;
          const target = parseInt(el.dataset.target, 10);
          let current = 0;
          const step = target / 60;
          const timer = setInterval(() => {
            current = Math.min(current + step, target);
            el.textContent = Math.floor(current);
            if (current >= target) clearInterval(timer);
          }, 16);
          counterObs.unobserve(el);
        });
      },
      { threshold: 0.5 }
    );
    document.querySelectorAll(".lp-counter").forEach((el) => counterObs.observe(el));

    // Feature card mouse glow
    document.querySelectorAll(".lp-feature-card").forEach((card) => {
      const onMove = (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mouse-x", e.clientX - r.left + "px");
        card.style.setProperty("--mouse-y", e.clientY - r.top + "px");
      };
      card.addEventListener("mousemove", onMove);
    });

    return () => {
      window.removeEventListener("scroll", onScroll);
      io.disconnect();
      counterObs.disconnect();
    };
  }, []);

  return (
    <div className="landing-root" data-lp-theme={lpTheme}>
      {/* Cursor */}
      <div className="lp-cursor-dot" ref={dotRef} />
      <div className="lp-cursor-ring" ref={ringRef} />

      {/* Canvas background */}
      <canvas
        ref={canvasRef}
        style={{ position: "fixed", inset: 0, zIndex: 0, opacity: 0.35, pointerEvents: "none" }}
      />

      {/* ── NAV ──────────────────────────────────────────────────────── */}
      <nav className="lp-nav" id="lp-nav">
        <a href="#" className="lp-nav-logo">
          <LogoIcon size={26} />
          Lotis<span>Pro</span>
        </a>
        <ul className="lp-nav-links">
          <li><a href="#fonctionnalites">Fonctionnalités</a></li>
          <li><a href="#roles">Équipes</a></li>
          <li><a href="#carte">Cartographie</a></li>
          <li><a href="#services-ia">Services IA</a></li>
          <li><Link to="/contact">Contact</Link></li>
          <li><Link to="/login" className="lp-nav-cta">Connexion</Link></li>
          <li>
            <button className="lp-theme-toggle" onClick={toggleTheme} title={lpTheme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"} aria-label="Changer le thème">
              {lpTheme === "dark" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
          </li>
        </ul>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="lp-hero lp-section">
        <div className="lp-hero-eyebrow" id="lp-hero-eyebrow">
          <div className="lp-eyebrow-dot" />
          Gestion foncière nouvelle génération
        </div>
        <h1 className="lp-hero-title" id="lp-hero-title">
          <span className="lp-line-block">Pilotez vos projets</span>
          <span className="lp-line-block"><em>immobiliers</em> depuis</span>
          <span className="lp-line-block">un seul tableau</span>
        </h1>
        <p className="lp-hero-sub" id="lp-hero-sub">
          LotisPro centralise vos lots, réservations, équipes commerciales et plannings de paiement. Visualisez chaque parcelle sur carte. Prenez des décisions en temps réel.
        </p>
        <div className="lp-hero-actions" id="lp-hero-actions">
          <Link to="/contact" className="lp-btn-primary">Demander une démo gratuite</Link>
          <a href="#fonctionnalites" className="lp-btn-ghost">Découvrir les fonctionnalités</a>
        </div>

        {/* Dashboard Mockup */}
        <div className="lp-hero-visual lp-reveal" id="lp-hero-visual">
          <div className="lp-mockup-frame">
            <div className="lp-mockup-topbar">
              <div className="lp-mockup-dot" />
              <div className="lp-mockup-dot" />
              <div className="lp-mockup-dot" />
              <div className="lp-mockup-url">app.lotispro.com/dashboard</div>
            </div>
            <div className="lp-mockup-body">
              <div className="lp-mockup-sidebar">
                {[
                  { label: "Tableau de bord", active: true },
                  { label: "Projets" },
                  { label: "Clients" },
                  { label: "Équipe commerciale" },
                  { label: "Paiements" },
                  { label: "Rapports" },
                ].map((item) => (
                  <div key={item.label} className={`lp-mockup-nav-item${item.active ? " active" : ""}`}>
                    <div className="lp-icon-dot" />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="lp-mockup-content">
                <div className="lp-mockup-stats">
                  <div className="lp-mockup-stat">
                    <div className="lp-mockup-stat-val brass">247</div>
                    <div className="lp-mockup-stat-lbl">Lots total</div>
                  </div>
                  <div className="lp-mockup-stat">
                    <div className="lp-mockup-stat-val green">89</div>
                    <div className="lp-mockup-stat-lbl">Disponibles</div>
                    <div className="lp-mockup-trend">↑ 12%</div>
                  </div>
                  <div className="lp-mockup-stat">
                    <div className="lp-mockup-stat-val amber">112</div>
                    <div className="lp-mockup-stat-lbl">Réservés</div>
                  </div>
                  <div className="lp-mockup-stat">
                    <div className="lp-mockup-stat-val" style={{ color: "var(--lp-red)" }}>46</div>
                    <div className="lp-mockup-stat-lbl">Vendus</div>
                    <div className="lp-mockup-trend">↑ 8%</div>
                  </div>
                </div>
                <div className="lp-mockup-bottom">
                  <div className="lp-mockup-card">
                    <div className="lp-mockup-card-title">Ventes mensuelles</div>
                    <div className="lp-mini-bars">
                      {[false, false, false, false, false, false, true].map((h, i) => (
                        <div key={i} className={`lp-mini-bar${h ? " highlight" : ""}`} />
                      ))}
                    </div>
                  </div>
                  <div className="lp-mockup-card">
                    <div className="lp-mockup-card-title">Carte du projet</div>
                    <div className="lp-mini-map">
                      <div className="lp-map-mini-grid">
                        {["av","rs","sd","av","av","rs","rs","av","bl","sd","av","rs","av","sd","av","rs","av","av"].map((s, i) => (
                          <div key={i} className={`lp-map-mini-lot ${s}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── NUMBERS BAR ──────────────────────────────────────────────── */}
      <div className="lp-numbers-bar">
        {[
          { target: 10, unit: "+", label: "Projets gérés simultanément" },
          { target: 500, unit: "+", label: "Lots par projet en moyenne" },
          { target: 3, unit: "", label: "Rôles avec accès contrôlé" },
          { target: 100, unit: "%", label: "Traçabilité des opérations" },
        ].map(({ target, unit, label }) => (
          <div key={label} className="lp-number-item lp-reveal">
            <div className="lp-number-val">
              <span className="lp-counter" data-target={target}>0</span>
              <span className="lp-number-unit">{unit}</span>
            </div>
            <div className="lp-number-lbl">{label}</div>
          </div>
        ))}
      </div>

      {/* ── PROBLEM ──────────────────────────────────────────────────── */}
      <section className="lp-section-problem lp-section">
        <div className="lp-eyebrow lp-reveal">Le problème</div>
        <h2 className="lp-section-title lp-reveal lp-reveal-d1">
          Fini les tableurs Excel<br /><em>et les informations éparpillées</em>
        </h2>
        <p className="lp-section-sub lp-reveal lp-reveal-d2">
          La majorité des promoteurs immobiliers gèrent encore leurs projets avec des fichiers partagés et des chaînes d'e-mails. Résultat : erreurs, doublons, et prise de décision à l'aveugle.
        </p>
        <div className="lp-pain-grid">
          {[
            {
              title: "Versions Excel incontrôlables",
              text: "Qui a la dernière version ? Quelle réservation est valide ? Les doublons et conflits coûtent des ventes manquées.",
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              ),
            },
            {
              title: "Zéro visibilité en temps réel",
              text: "Quels lots sont disponibles ? Quelles réservations expirent demain ? Sans tableau de bord centralisé, vous naviguez à l'aveugle.",
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              ),
            },
            {
              title: "Équipe non coordonnée",
              text: "Deux agents réservent le même lot au même client. Pas d'historique partagé. Le chaos opérationnel coûte cher.",
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              ),
            },
          ].map(({ title, text, icon }, i) => (
            <div key={title} className={`lp-pain-card lp-reveal lp-reveal-d${i + 1}`}>
              <div className="lp-pain-icon">{icon}</div>
              <div className="lp-pain-title">{title}</div>
              <div className="lp-pain-text">{text}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────── */}
      <section className="lp-section-features lp-section" id="fonctionnalites">
        <div className="lp-features-header">
          <div className="lp-eyebrow lp-reveal">Fonctionnalités</div>
          <h2 className="lp-section-title lp-reveal lp-reveal-d1">
            Tout ce dont un promoteur<br /><em>a besoin, dans un seul outil</em>
          </h2>
        </div>
        <div className="lp-features-grid">
          {[
            {
              num: "01", title: "Cartographie interactive", tag: "GeoJSON · Leaflet",
              text: "Visualisez vos projets sur une carte avec polygones colorés par statut. Cliquez sur un lot pour le réserver directement depuis la carte.",
              icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>,
            },
            {
              num: "02", title: "Pipeline de réservation complet", tag: "Réservations · Ventes",
              text: "Créez une réservation, enregistrez le dépôt, prolongez, libérez ou convertissez en vente. Chaque étape tracée, chaque action auditée.",
              icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
            },
            {
              num: "03", title: "Tableaux de bord KPI", tag: "Analytics · KPIs",
              text: "CA objectif vs. réalisé, taux de réservation, vélocité des ventes, classement des commerciaux. Chaque rôle voit ses propres métriques en direct.",
              icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>,
            },
            {
              num: "04", title: "Plans de paiement échelonnés", tag: "Paiements · Échéanciers",
              text: "Définissez acompte, solde, périodicité. Le système génère automatiquement les échéances et alerte sur les retards de paiement.",
              icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
            },
            {
              num: "05", title: "Gestion d'équipe avec RBAC", tag: "Équipe · Permissions",
              text: "Invitez vos agents par e-mail. Assignez-les à des projets. Chaque rôle (directeur, commercial, client) voit uniquement ce qu'il doit voir.",
              icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
            },
            {
              num: "06", title: "Audit complet & conformité", tag: "Audit · Conformité",
              text: "Chaque création, modification et suppression est enregistrée. Journal d'audit intégral pour la conformité réglementaire France / Maroc.",
              icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
            },
          ].map(({ num, title, tag, text, icon }, i) => (
            <div key={num} className={`lp-feature-card lp-reveal lp-reveal-d${(i % 3) + 1}`}>
              <div className="lp-feature-num">{num}</div>
              <div className="lp-feature-icon">{icon}</div>
              <div className="lp-feature-title">{title}</div>
              <div className="lp-feature-text">{text}</div>
              <div className="lp-feature-tag">{tag}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── WORKFLOW ─────────────────────────────────────────────────── */}
      <section className="lp-section-workflow lp-section">
        <div className="lp-workflow-inner">
          <div className="lp-workflow-header">
            <div className="lp-eyebrow lp-reveal">Cycle de vie d'un lot</div>
            <h2 className="lp-section-title lp-reveal lp-reveal-d1">
              Du lot disponible à la vente<br /><em>en quatre étapes claires</em>
            </h2>
          </div>
          <div className="lp-workflow-steps">
            {[
              { num: "01", status: "available", statusLabel: "Disponible", title: "Lot créé", text: "Importez vos lots par CSV ou créez-les manuellement. Surface, prix, zone, géométrie. Tout est centralisé." },
              { num: "02", status: "reserved", statusLabel: "Réservé", title: "Réservation", text: "Le commercial associe le lot à un client. Dépôt de garantie, date d'expiration et plan de paiement définis." },
              { num: "03", status: "validated", statusLabel: "Validé", title: "Validation", text: "Le directeur valide la réservation. Documents vérifiés, conditions financières confirmées." },
              { num: "04", status: "sold", statusLabel: "Vendu", title: "Vente finalisée", text: "Lot marqué vendu, CA mis à jour, échéances de paiement suivies automatiquement." },
            ].map(({ num, status, statusLabel, title, text }, i) => (
              <div key={num} className={`lp-workflow-step lp-reveal lp-reveal-d${i + 1}`}>
                <div className="lp-step-circle">{num}</div>
                <div className={`lp-step-status ${status}`}>{statusLabel}</div>
                <div className="lp-step-title">{title}</div>
                <div className="lp-step-text">{text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ROLES ────────────────────────────────────────────────────── */}
      <section className="lp-section-roles lp-section" id="roles">
        <div className="lp-roles-header">
          <div className="lp-eyebrow lp-reveal">Conçu pour chaque rôle</div>
          <h2 className="lp-section-title lp-reveal lp-reveal-d1">
            Une plateforme,<br /><em>trois expériences</em>
          </h2>
          <p className="lp-section-sub lp-reveal lp-reveal-d2">
            Chaque utilisateur accède exactement à ce dont il a besoin.
          </p>
        </div>
        <div className="lp-roles-grid">
          {/* Manager */}
          <div className="lp-role-card manager lp-reveal">
            <div className="lp-role-badge manager"><IconShield /> Directeur</div>
            <div className="lp-role-title">Vue d'ensemble totale</div>
            <div className="lp-role-desc">Le directeur pilote l'ensemble du portefeuille, gère l'équipe et prend des décisions basées sur les données.</div>
            <ul className="lp-role-features">
              {["Dashboard global multi-projets","Gestion et invitation de l'équipe","Affectation des commerciaux","Validation des réservations et ventes","Journal d'audit complet","KPIs par commercial et par projet"].map((f) => (
                <li key={f}><IconCheck className="lp-check" />{f}</li>
              ))}
            </ul>
          </div>
          {/* Commercial */}
          <div className="lp-role-card commercial lp-reveal lp-reveal-d1">
            <div className="lp-role-badge commercial"><IconUser /> Commercial</div>
            <div className="lp-role-title">Focus sur la vente</div>
            <div className="lp-role-desc">L'agent voit ses projets assignés, ses clients et ses performances personnelles. Rien de plus, rien de moins.</div>
            <ul className="lp-role-features">
              {["Carte interactive des lots disponibles","Création et gestion des réservations","Gestion de son portefeuille clients","Plans de paiement et échéanciers","KPIs personnels (ventes, CA, rang)","Alertes réservations expirant bientôt"].map((f) => (
                <li key={f}><IconCheck className="lp-check violet" />{f}</li>
              ))}
            </ul>
          </div>
          {/* Client */}
          <div className="lp-role-card client lp-reveal lp-reveal-d2">
            <div className="lp-role-badge client"><IconClient /> Client</div>
            <div className="lp-role-title">Transparence totale</div>
            <div className="lp-role-desc">L'acheteur accède à son espace personnel pour suivre sa réservation et ses échéances de paiement.</div>
            <ul className="lp-role-features">
              {["Suivi de sa réservation en direct","Calendrier des échéances de paiement","Statut des paiements (payé/en attente)","Informations sur son lot et projet","Historique complet des transactions"].map((f) => (
                <li key={f}><IconCheck className="lp-check green" />{f}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── MAP ──────────────────────────────────────────────────────── */}
      <section className="lp-section-map lp-section" id="carte">
        <div className="lp-map-inner">
          <div className="lp-reveal">
            <div className="lp-eyebrow">Cartographie</div>
            <h2 className="lp-map-title">Voyez votre projet<br /><em>comme jamais</em></h2>
            <p className="lp-map-desc">Chaque lot est représenté par son polygone géographique réel. La couleur raconte le statut. Cliquez, zoomez, filtrez.</p>
            <div className="lp-map-legend">
              {[["#10b981","Disponible"],["#f59e0b","Réservé"],["#8b5cf6","Validé"],["#ef4444","Vendu"],["#6b7280","Bloqué"]].map(([color, label]) => (
                <div key={label} className="lp-legend-item">
                  <div className="lp-legend-dot" style={{ background: color }} />
                  {label}
                </div>
              ))}
            </div>
            <Link to="/contact" className="lp-btn-primary">Voir une démo cartographique</Link>
          </div>
          <div className="lp-map-visual lp-reveal lp-reveal-d2">
            <div className="lp-map-visual-bg" />
            <div className="lp-map-lots-grid">
              {[
                { c: "av span2", n: "A01" }, { c: "rs", n: "A02" }, { c: "av", n: "A03" }, { c: "sd", n: "A04" },
                { c: "av row2", n: "B01" }, { c: "vl span2", n: "B02" }, { c: "rs", n: "B03" }, { c: "av", n: "B04" }, { c: "bl", n: "B05" },
                { c: "sd span2 row2", n: "C01" }, { c: "av", n: "C02" }, { c: "rs", n: "C03" }, { c: "av row2", n: "C04" },
                { c: "vl", n: "D01" }, { c: "rs", n: "D02" }, { c: "av span2", n: "D03" }, { c: "sd", n: "D04" },
                { c: "bl span2", n: "E01" }, { c: "av", n: "E02" }, { c: "rs row2", n: "E03" }, { c: "av", n: "E04" },
                { c: "sd span2", n: "F01" }, { c: "av", n: "F02" }, { c: "vl span2", n: "F03" },
              ].map(({ c, n }) => (
                <div key={n} className={`lp-lot-poly ${c}`}>
                  <div className="lp-lot-num">{n}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PAYMENT ──────────────────────────────────────────────────── */}
      <section className="lp-section-payment lp-section">
        <div className="lp-payment-inner">
          <div className="lp-reveal">
            <div className="lp-eyebrow">Plans de paiement</div>
            <h2 className="lp-section-title" style={{ textAlign: "left", fontSize: "clamp(36px,3.5vw,56px)" }}>
              Des échéanciers<br /><em>automatiques</em>
            </h2>
            <p style={{ marginTop: 16, fontSize: 15, color: "var(--lp-text1)", lineHeight: 1.7, maxWidth: 460 }}>
              Définissez les conditions financières une seule fois : pourcentage d'acompte, solde, périodicité. LotisPro génère les échéances, alerte en cas de retard et aide à suivre chaque paiement reçu.
            </p>
            <div className="lp-payment-checklist">
              {["Génération automatique des échéances","Alertes tableau de bord pour les retards","Vue client : ce qui est dû, quand et combien","Suivi des remboursements d'acompte"].map((txt) => (
                <div key={txt} className="lp-payment-check">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--lp-brass)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  {txt}
                </div>
              ))}
            </div>
          </div>
          <div className="lp-payment-ui lp-reveal lp-reveal-d2">
            <div className="lp-payment-header">
              <div className="lp-payment-title-ui">Lot A14 — Plan de paiement</div>
              <div className="lp-payment-badge">En cours</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--lp-text2)", marginBottom: 8 }}>
              <span>Progression</span>
              <span style={{ color: "var(--lp-text0)", fontWeight: 600 }}>650 000 / 1 000 000 MAD</span>
            </div>
            <div className="lp-payment-progress-bar"><div className="lp-payment-progress-fill" /></div>
            <div className="lp-payment-pct">65%</div>
            <div className="lp-installments">
              {[
                { n: "#1", date: "15 jan. 2026", amount: "200 000 MAD", status: "paid", label: "Payé" },
                { n: "#2", date: "15 fév. 2026", amount: "150 000 MAD", status: "paid", label: "Payé" },
                { n: "#3", date: "15 mar. 2026", amount: "150 000 MAD", status: "paid", label: "Payé" },
                { n: "#4", date: "15 avr. 2026", amount: "150 000 MAD", status: "pending", label: "En attente" },
                { n: "#5", date: "15 mai 2026", amount: "150 000 MAD", status: "late", label: "En retard" },
                { n: "#6", date: "15 jun. 2026", amount: "200 000 MAD", status: "pending", label: "En attente" },
              ].map(({ n, date, amount, status, label }) => (
                <div key={n} className={`lp-installment-row ${status === "paid" ? "paid" : ""}`}>
                  <span className="lp-inst-num">{n}</span>
                  <span className="lp-inst-date">{date}</span>
                  <span className="lp-inst-amount">{amount}</span>
                  <span className={`lp-inst-status ${status}`}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── ENTERPRISE FEATURES ──────────────────────────────────────── */}
      <section className="lp-section-enterprise lp-section" id="entreprise">
        <div className="lp-enterprise-inner">
          <div className="lp-enterprise-header">
            <div className="lp-eyebrow lp-reveal">Solution Entreprise</div>
            <h2 className="lp-section-title lp-reveal lp-reveal-d1">
              Tout ce dont vous avez besoin,<br /><em>sans rien laisser de côté</em>
            </h2>
            <p className="lp-section-sub lp-reveal lp-reveal-d2">
              LotisPro est conçu pour les promoteurs immobiliers professionnels. Chaque fonctionnalité est disponible dès le départ — projets, équipes et lots illimités.
            </p>
          </div>

          <div className="lp-enterprise-grid">
            {[
              {
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>,
                category: "Gestion foncière",
                color: "brass",
                features: [
                  "Cartographie interactive GeoJSON / Leaflet",
                  "Lots et projets illimités",
                  "Importation CSV des lots",
                  "Statuts en temps réel — disponible, réservé, validé, vendu",
                  "Zones et surfaces configurables",
                ],
              },
              {
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
                category: "Pipeline commercial",
                color: "violet",
                features: [
                  "Réservations avec expiration automatique",
                  "Validation multi-niveaux (directeur → vente)",
                  "Conversion réservation → vente directe",
                  "Gestion du portefeuille client complet",
                  "Alertes réservations expirant bientôt",
                ],
              },
              {
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
                category: "Finances & paiements",
                color: "green",
                features: [
                  "Plans de paiement échelonnés automatiques",
                  "Génération automatique des échéances",
                  "Alertes et suivi des retards",
                  "Vue client — ce qui est dû, quand et combien",
                  "Suivi multi-devise MAD / EUR",
                ],
              },
              {
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>,
                category: "Équipe & sécurité",
                color: "red",
                features: [
                  "RBAC 3 niveaux — directeur, commercial, client",
                  "Assignation des commerciaux par projet",
                  "Invitation par e-mail avec accès contrôlé",
                  "Journal d'audit intégral de chaque action",
                  "Conformité réglementaire France / Maroc",
                ],
              },
              {
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>,
                category: "Analytics & reporting",
                color: "amber",
                features: [
                  "KPIs temps réel par commercial et par projet",
                  "Dashboard multi-projets centralisé",
                  "CA objectif vs. réalisé en continu",
                  "Vélocité des ventes et taux de réservation",
                  "Classement et performance des commerciaux",
                ],
              },
              {
                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.07 4.93l-1.41 1.41M5.34 18.66l-1.41 1.41M2 12h2M20 12h2M19.07 19.07l-1.41-1.41M5.34 5.34L3.93 3.93" /></svg>,
                category: "Déploiement & support",
                color: "brass",
                features: [
                  "API REST complète documentée",
                  "Déploiement cloud ou on-premise",
                  "SLA garanti 99.9% de disponibilité",
                  "Manager de compte dédié",
                  "Onboarding et migration de données inclus",
                ],
              },
            ].map(({ icon, category, color, features }) => (
              <div key={category} className={`lp-ent-card lp-reveal lp-ent-card--${color}`}>
                <div className={`lp-ent-icon lp-ent-icon--${color}`}>{icon}</div>
                <div className="lp-ent-category">{category}</div>
                <ul className="lp-ent-features">
                  {features.map((f) => (
                    <li key={f}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Contact CTA */}
          <div className="lp-ent-cta lp-reveal">
            <div className="lp-ent-cta-glow" />
            <div className="lp-ent-cta-tag">Tarification sur mesure</div>
            <h3 className="lp-ent-cta-title">Prêt à transformer votre organisation ?</h3>
            <p className="lp-ent-cta-sub">
              Discutons de vos besoins. Démo personnalisée en 30 minutes,<br />migration de données et onboarding inclus.
            </p>
            <div className="lp-ent-cta-actions">
              <Link to="/contact" className="lp-btn-primary">Contacter notre équipe</Link>
              <Link to="/login" className="lp-btn-ghost">Accéder à l'application</Link>
            </div>
            <div className="lp-ent-cta-badges">
              {["Démo gratuite 30 min", "Migration incluse", "Déploiement rapide", "SLA 99.9%"].map((b) => (
                <span key={b} className="lp-ent-badge">{b}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── IA & MIGRATION ───────────────────────────────────────────── */}
      <section className="lp-section-ia lp-section" id="services-ia">
        <div className="lp-ia-inner">
          <div className="lp-ia-header">
            <div className="lp-eyebrow lp-reveal">Services avancés</div>
            <h2 className="lp-section-title lp-reveal lp-reveal-d1">
              Migration de données<br /><em>et intelligence artificielle</em>
            </h2>
            <p className="lp-section-sub lp-reveal lp-reveal-d2">
              LotisPro vous accompagne au-delà du logiciel : conversion de vos plans existants et analyse intelligente de vos données en temps réel.
            </p>
          </div>

          <div className="lp-ia-grid">

            {/* Bloc PDF → GeoJSON */}
            <div className="lp-ia-block lp-ia-block--pdf lp-reveal">
              <div className="lp-ia-block-content">
                <div className="lp-ia-block-eyebrow">Service d'onboarding</div>
                <h3 className="lp-ia-block-title">
                  Convertissez vos plans PDF<br /><em>en carte interactive</em>
                </h3>
                <p className="lp-ia-block-desc">
                  Vous avez des plans cadastraux, des fichiers d'architecte ou des tableaux Excel ? Notre équipe prend en charge la conversion complète vers GeoJSON. Vos lots apparaissent sur la carte en quelques jours.
                </p>
                <ul className="lp-ia-checklist">
                  {["Plans PDF, DWG, cadastre numérique", "Détection et vectorisation des polygones", "Validation géométrique et nommage des lots", "Import direct dans LotisPro"].map((item) => (
                    <li key={item}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--lp-amber)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="lp-ia-visual lp-reveal lp-reveal-d2">
                <div className="lp-pdf-mockup">
                  {/* PDF simulé */}
                  <div className="lp-pdf-side">
                    <div className="lp-pdf-doc">
                      <div className="lp-pdf-topbar">
                        <div className="lp-pdf-dot" /><div className="lp-pdf-dot" /><div className="lp-pdf-dot" />
                        <span className="lp-pdf-name">plan_cadastral.pdf</span>
                      </div>
                      <div className="lp-pdf-body">
                        <div className="lp-pdf-rect--lg" />
                        <div className="lp-pdf-lines">
                          <div className="lp-pdf-line" />
                          <div className="lp-pdf-line lp-pdf-line--short" />
                          <div className="lp-pdf-line lp-pdf-line--med" />
                        </div>
                        <div className="lp-pdf-plan-grid">
                          {Array.from({ length: 9 }).map((_, i) => <div key={i} className="lp-pdf-plan-cell" />)}
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Flèche */}
                  <div className="lp-pdf-arrow">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--lp-brass)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                    </svg>
                    <span className="lp-pdf-arrow-label">Conversion</span>
                  </div>
                  {/* GeoJSON coloré */}
                  <div className="lp-pdf-side">
                    <div className="lp-pdf-doc lp-pdf-doc--geo">
                      <div className="lp-pdf-topbar lp-pdf-topbar--geo">
                        <div className="lp-pdf-dot" /><div className="lp-pdf-dot" /><div className="lp-pdf-dot" />
                        <span className="lp-pdf-name">projet.geojson</span>
                      </div>
                      <div className="lp-pdf-body">
                        <div className="lp-geo-lot-grid">
                          {[["av","span2"],["rs"],["av"],["sd"],["vl"],["rs","span2"],["av"],["av"],["sd"],["vl"],["rs"]].map((cls, i) => (
                            <div key={i} className={`lp-geo-lot ${cls.join(" ")}`} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bloc Assistant IA */}
            <div className="lp-ia-block lp-ia-block--ai lp-reveal lp-reveal-d1">
              <div className="lp-ia-visual lp-reveal lp-reveal-d2">
                <div className="lp-chat-mockup">
                  <div className="lp-chat-topbar">
                    <div className="lp-chat-avatar">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                      </svg>
                    </div>
                    <div>
                      <div className="lp-chat-title">Assistant LotisPro</div>
                      <div className="lp-chat-status"><span className="lp-chat-dot" />En ligne</div>
                    </div>
                  </div>
                  <div className="lp-chat-messages">
                    <div className="lp-chat-msg lp-chat-msg--user">
                      Quel est le taux de réservation du projet Résidence Atlas ce mois-ci ?
                    </div>
                    <div className="lp-chat-msg lp-chat-msg--ai">
                      <span className="lp-chat-ai-label">IA</span>
                      Résidence Atlas — <strong>73 %</strong> de réservation. Sur 124 lots, 91 sont réservés ou vendus. +8 % vs le mois dernier. Zones B et C les plus demandées.
                    </div>
                    <div className="lp-chat-msg lp-chat-msg--user">
                      Quels commerciaux ont le plus de réservations en attente ?
                    </div>
                    <div className="lp-chat-msg lp-chat-msg--ai">
                      <span className="lp-chat-ai-label">IA</span>
                      <strong>Karim B.</strong> — 7 en attente · <strong>Sofia M.</strong> — 5 · <strong>Youssef A.</strong> — 4. Délai moyen de validation : 2,3 jours.
                    </div>
                  </div>
                  <div className="lp-chat-input">
                    <span className="lp-chat-placeholder">Posez votre question...</span>
                    <div className="lp-chat-send">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
              <div className="lp-ia-block-content">
                <div className="lp-ia-block-eyebrow lp-ia-block-eyebrow--violet">Fonctionnalité intégrée</div>
                <h3 className="lp-ia-block-title">
                  Posez vos questions,<br /><em>obtenez des analyses</em>
                </h3>
                <p className="lp-ia-block-desc">
                  L'assistant IA de LotisPro accède à toutes vos données en temps réel. Demandez des comparatifs de performance, des projections ou une synthèse de vos lots — la réponse arrive en secondes.
                </p>
                <ul className="lp-ia-checklist lp-ia-checklist--violet">
                  {["Requêtes en langage naturel", "Analyse des KPIs et tendances", "Anomalies détectées automatiquement", "Résumés exécutifs sur demande"].map((item) => (
                    <li key={item}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--lp-violet)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="lp-section-cta lp-section" id="demo">
        <div className="lp-eyebrow lp-reveal">Prêt à démarrer ?</div>
        <h2 className="lp-cta-title lp-reveal lp-reveal-d1">
          Transformez votre façon<br />de <em>gérer vos projets</em>
        </h2>
        <p className="lp-cta-sub lp-reveal lp-reveal-d2">
          Rejoignez les promoteurs qui ont arrêté Excel.<br />
          Démo personnalisée en 30 minutes, migration incluse.
        </p>
        <div className="lp-hero-actions lp-reveal lp-reveal-d3" style={{ justifyContent: "center" }}>
          <Link to="/contact" className="lp-btn-primary" style={{ fontSize: 16, padding: "18px 44px" }}>
            Demander une démo gratuite
          </Link>
          <Link to="/login" className="lp-btn-ghost" style={{ fontSize: 16, padding: "17px 36px" }}>
            Accéder à l'application
          </Link>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-footer-top">
          <div>
            <div className="lp-footer-logo"><LogoIcon size={30} />Lotis<span>Pro</span></div>
            <div className="lp-footer-tagline">La plateforme de référence pour la gestion foncière et immobilière en France et au Maroc.</div>
          </div>
          <div>
            <div className="lp-footer-col-title">Produit</div>
            <ul className="lp-footer-links">
              {["Fonctionnalités","Démo","Roadmap","Nouveautés"].map((l) => <li key={l}><a href="#">{l}</a></li>)}
              <li><Link to="/contact">Contact</Link></li>
            </ul>
          </div>
          <div>
            <div className="lp-footer-col-title">Entreprise</div>
            <ul className="lp-footer-links">
              {["À propos","Blog","Carrières","Presse"].map((l) => <li key={l}><a href="#">{l}</a></li>)}
            </ul>
          </div>
          <div>
            <div className="lp-footer-col-title">Support</div>
            <ul className="lp-footer-links">
              {["Documentation","Centre d'aide","Contact","Mentions légales","Confidentialité"].map((l) => <li key={l}><a href="#">{l}</a></li>)}
            </ul>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <div className="lp-footer-copy">© 2026 LotisPro. Tous droits réservés.</div>
          <div className="lp-footer-made">Fait avec <span>◆</span> pour les promoteurs immobiliers</div>
        </div>
      </footer>
    </div>
  );
}
