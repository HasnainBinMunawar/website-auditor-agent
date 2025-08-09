// >>> file: components/Header.js
import Link from 'next/link'

export default function Header() {
  return (
    <header className="site-header" role="banner">
      <div className="container header-inner">
        <Link href="/" className="brand" aria-label="Homepage">
          <svg className="logo" width="36" height="36" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#g)"></rect>
            <defs>
              <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#4f46e5" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
            <path d="M7 12h10M7 8h8M7 16h6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
          </svg>
          <span className="brand-text">Website Auditor Agent</span>
        </Link>

        <nav aria-label="Primary" className="nav">
          <a href="#" className="nav-link" onClick={(e)=>e.preventDefault()}>Docs</a>
          <a href="#" className="nav-link" onClick={(e)=>e.preventDefault()}>Contact</a>
        </nav>
      </div>

      <style jsx>{`
        .site-header { border-bottom: 1px solid var(--edge); background: var(--bg); }
        .header-inner { display:flex; align-items:center; justify-content:space-between; padding: .75rem 1rem; max-width:1100px; margin:0 auto; }
        .brand { display:flex; align-items:center; gap:.75rem; text-decoration:none; color:inherit; }
        .brand-text { font-weight:700; letter-spacing: -0.01em; }
        .nav { display:flex; gap:.75rem; }
        .nav-link { padding:.4rem .6rem; border-radius:6px; color:var(--muted); text-decoration:none; font-size:.95rem; }
        .nav-link:focus, .nav-link:hover { background:var(--hover); color:var(--text); outline: none; }
        @media (max-width:600px) {
          .nav { display:none }
        }
      `}</style>
    </header>
  )
}
