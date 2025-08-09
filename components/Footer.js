// >>> file: components/Footer.js
export default function Footer() {
    return (
      <footer className="site-footer" role="contentinfo">
        <div className="container" style={{padding: '1.5rem 1rem', textAlign:'center'}}>
          <small>© {new Date().getFullYear()} Website Auditor Agent — Built for clarity and action.</small>
        </div>
        <style jsx>{`
          .site-footer { border-top:1px solid var(--edge); background:var(--bg); color:var(--muted); }
        `}</style>
      </footer>
    )
  }
  