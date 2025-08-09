// >>> file: components/LoadingSkeleton.js
export default function LoadingSkeleton() {
    return (
      <div className="skeleton" aria-live="polite" role="status">
        <div className="bar">
          <div className="progress" style={{width: '36%'}} />
        </div>
  
        <div className="s-grid">
          <div className="s-card">
            <div className="s-title" />
            <div className="s-line" />
            <div className="s-line short" />
          </div>
          <div className="s-card">
            <div className="s-title" />
            <div className="s-line" />
            <div className="s-line short" />
          </div>
          <div className="s-card">
            <div className="s-title" />
            <div className="s-line" />
            <div className="s-line short" />
          </div>
        </div>
  
        <style jsx>{`
          .bar { height:8px; background:var(--edge); border-radius:999px; overflow:hidden; margin:.75rem 0 1rem; }
          .progress { height:100%; background:linear-gradient(90deg,#4f46e5,#06b6d4); animation: prog 2.5s linear infinite; border-radius:999px; }
          @keyframes prog { 0%{transform:translateX(-40%)}100%{transform:translateX(140%)} }
          .s-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; }
          .s-card { background:var(--card-bg); padding:1rem; border-radius:10px; box-shadow:var(--card-shadow); }
          .s-title { height:14px; width:40%; background:linear-gradient(90deg,#e6e9ef,#f3f4f6); border-radius:6px; margin-bottom:.6rem; }
          .s-line { height:10px; background:linear-gradient(90deg,#eef2ff,#f8fafc); border-radius:6px; margin-bottom:.5rem; }
          .s-line.short { width:70%; }
          @media (max-width:900px) { .s-grid { grid-template-columns: 1fr; } }
        `}</style>
      </div>
    )
  }
  