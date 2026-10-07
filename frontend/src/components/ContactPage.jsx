import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "../landing.css";
import { API_BASE_URL } from "../utils/config";

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

const SCALE_OPTIONS = [
  "Moins de 50 lots",
  "50 à 200 lots",
  "200 à 500 lots",
  "Plus de 500 lots",
  "Plusieurs projets simultanés",
];

export default function ContactPage() {
  const canvasRef = useRef(null);
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const [lpTheme, setLpTheme] = useState(
    () => localStorage.getItem("lp-theme") || "dark"
  );
  const [form, setForm] = useState({
    company: "",
    name: "",
    email: "",
    phone: "",
    scale: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const toggleTheme = () => {
    setLpTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      localStorage.setItem("lp-theme", next);
      return next;
    });
  };

  /* ── Google Fonts ── */
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
    document.querySelectorAll("a, button, input, textarea, select").forEach((el) => {
      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);
    });
    rafId = requestAnimationFrame(animate);
    return () => {
      document.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  /* ── Canvas background ── */
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
            alpha: 0.05 + Math.random() * 0.08,
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
        const a = l.alpha + Math.sin(t * l.speed + l.phase) * 0.02;
        ctx.strokeStyle = `rgba(212,151,58,${a})`;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(l.x, l.y, l.w, l.h);
      });
      rafId = requestAnimationFrame(draw);
    };
    window.addEventListener("resize", resize);
    resize();
    rafId = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafId);
    };
  }, []);

  /* ── Nav scroll ── */
  useEffect(() => {
    const nav = document.getElementById("lp-nav-contact");
    const onScroll = () => nav?.classList.toggle("scrolled", window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const [submitError, setSubmitError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Une erreur est survenue.");
      }
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message || "Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="landing-root" data-lp-theme={lpTheme}>
      {/* Cursor */}
      <div className="lp-cursor-dot" ref={dotRef} />
      <div className="lp-cursor-ring" ref={ringRef} />

      {/* Canvas background */}
      <canvas
        ref={canvasRef}
        style={{ position: "fixed", inset: 0, zIndex: 0, opacity: 0.25, pointerEvents: "none" }}
      />

      {/* ── NAV ── */}
      <nav className="lp-nav" id="lp-nav-contact">
        <Link to="/" className="lp-nav-logo">
          <LogoIcon size={26} />
          Lotis<span>Pro</span>
        </Link>
        <ul className="lp-nav-links">
          <li><a href="/#fonctionnalites">Fonctionnalités</a></li>
          <li><a href="/#roles">Équipes</a></li>
          <li><a href="/#carte">Cartographie</a></li>
          <li><Link to="/contact" style={{ color: "var(--lp-brass)" }}>Contact</Link></li>
          <li><Link to="/login" className="lp-nav-cta">Connexion</Link></li>
          <li>
            <button className="lp-theme-toggle" onClick={toggleTheme} aria-label="Changer le thème">
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

      {/* ── CONTACT MAIN ── */}
      <main className="lp-contact-root">
        <div className="lp-contact-inner">

          {/* Left — info panel */}
          <div className="lp-contact-info">
            <div className="lp-eyebrow" style={{ marginBottom: 20 }}>Nous contacter</div>
            <h1 className="lp-contact-title">
              Parlons de<br /><em>votre projet</em>
            </h1>
            <p className="lp-contact-desc">
              Chaque organisation a ses particularités. Décrivez votre activité et nous vous proposerons une démonstration adaptée à vos projets, votre équipe et votre contexte.
            </p>

            <div className="lp-contact-promises">
              {[
                {
                  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
                  label: "Réponse sous 24h",
                  sub: "Jours ouvrés",
                },
                {
                  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
                  label: "Démo personnalisée",
                  sub: "30 minutes, adaptée à votre contexte",
                },
                {
                  icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 14a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 3.28h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8 10a16 16 0 0 0 6 6l.85-.85a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
                  label: "Aucun engagement",
                  sub: "Échangeons librement",
                },
              ].map(({ icon, label, sub }) => (
                <div key={label} className="lp-contact-promise">
                  <div className="lp-contact-promise-icon">{icon}</div>
                  <div>
                    <div className="lp-contact-promise-label">{label}</div>
                    <div className="lp-contact-promise-sub">{sub}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="lp-contact-divider" />

            <div className="lp-contact-direct">
              <div className="lp-contact-direct-label">Contact direct</div>
              <a href="mailto:contact@lotispro.com" className="lp-contact-email">
                contact@lotispro.com
              </a>
            </div>
          </div>

          {/* Right — form */}
          <div className="lp-contact-form-wrap">
            {submitted ? (
              <div className="lp-contact-success">
                <div className="lp-contact-success-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--lp-brass)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h3 className="lp-contact-success-title">Message envoyé</h3>
                <p className="lp-contact-success-sub">
                  Merci pour votre message. Notre équipe vous contactera dans les 24h ouvrées pour organiser une démonstration personnalisée.
                </p>
                <Link to="/" className="lp-btn-ghost" style={{ marginTop: 8 }}>
                  Retour à l'accueil
                </Link>
              </div>
            ) : (
              <form className="lp-contact-form" onSubmit={handleSubmit} noValidate>
                <div className="lp-contact-form-header">
                  <div className="lp-contact-form-title">Demande de démonstration</div>
                  <div className="lp-contact-form-sub">Tous les champs sont requis</div>
                </div>

                <div className="lp-cf-row">
                  <div className="lp-cf-field">
                    <label className="lp-cf-label" htmlFor="company">Entreprise</label>
                    <input
                      id="company" name="company" type="text"
                      className="lp-cf-input"
                      placeholder="Nom de votre société"
                      value={form.company}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="lp-cf-field">
                    <label className="lp-cf-label" htmlFor="name">Nom complet</label>
                    <input
                      id="name" name="name" type="text"
                      className="lp-cf-input"
                      placeholder="Prénom Nom"
                      value={form.name}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div className="lp-cf-row">
                  <div className="lp-cf-field">
                    <label className="lp-cf-label" htmlFor="email">Email professionnel</label>
                    <input
                      id="email" name="email" type="email"
                      className="lp-cf-input"
                      placeholder="vous@entreprise.com"
                      value={form.email}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div className="lp-cf-field">
                    <label className="lp-cf-label" htmlFor="phone">Téléphone</label>
                    <input
                      id="phone" name="phone" type="tel"
                      className="lp-cf-input"
                      placeholder="+212 6 00 00 00 00"
                      value={form.phone}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div className="lp-cf-field">
                  <label className="lp-cf-label" htmlFor="scale">Volume de votre activité</label>
                  <select
                    id="scale" name="scale"
                    className="lp-cf-input lp-cf-select"
                    value={form.scale}
                    onChange={handleChange}
                    required
                  >
                    <option value="" disabled>Sélectionnez votre échelle de projet</option>
                    {SCALE_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>

                <div className="lp-cf-field">
                  <label className="lp-cf-label" htmlFor="message">Votre message</label>
                  <textarea
                    id="message" name="message"
                    className="lp-cf-input lp-cf-textarea"
                    placeholder="Décrivez votre activité, vos projets en cours, vos besoins spécifiques…"
                    rows={5}
                    value={form.message}
                    onChange={handleChange}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="lp-btn-primary lp-cf-submit"
                  disabled={submitting}
                >
                  {submitting ? (
                    <span className="lp-cf-spinner" />
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                      Envoyer ma demande
                    </>
                  )}
                </button>

                {submitError && (
                  <p style={{ color: "var(--lp-red)", fontSize: 13, textAlign: "center", marginTop: 12 }}>
                    {submitError}
                  </p>
                )}
                <p className="lp-cf-privacy">
                  Vos données sont traitées avec confidentialité et ne seront jamais partagées avec des tiers.
                </p>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* ── FOOTER ── */}
      <footer className="lp-footer" style={{ marginTop: 0 }}>
        <div className="lp-footer-bottom" style={{ borderTop: "1px solid rgba(212,151,58,.08)" }}>
          <div className="lp-footer-copy">© 2026 LotisPro. Tous droits réservés.</div>
          <Link to="/" className="lp-footer-made" style={{ textDecoration: "none" }}>
            Retour à l'accueil <span>◆</span>
          </Link>
        </div>
      </footer>
    </div>
  );
}
