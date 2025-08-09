// >>> file: components/ChartModal.js
/**
 * components/ChartModal.js
 * Small React modal that renders a lightweight SVG line chart (no external libs).
 *
 * Usage instructions:
 * 1) Add this component file into components/.
 * 2) To open modal from existing ReportView, use:
 *
 *    import ChartModal from '../components/ChartModal'
 *    const [chartOpen, setChartOpen] = useState(false)
 *    const onOpenChart = () => setChartOpen(true)
 *    // Add to JSX: <button onClick={onOpenChart}>View LCP Chart</button>
 *    // Then render: <ChartModal open={chartOpen} onClose={()=>setChartOpen(false)} siteId={report.meta.url || report.meta.siteId} metric="lcp" />
 *
 * 3) The modal will call GET /api/audit-chart-data?siteId=...&metric=...
 *
 * Note: No edit to other files required.
 */

import { useEffect, useState } from "react";

export default function ChartModal({ open, onClose, siteId, metric = "lcp" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/audit-chart-data?siteId=${encodeURIComponent(siteId)}&metric=${encodeURIComponent(metric)}`)
      .then(r=>r.json())
      .then(j => { if (!cancelled) setData(j.series || []); })
      .catch(()=>{ if (!cancelled) setData([]); })
      .finally(()=>{ if (!cancelled) setLoading(false); });
    return ()=>{ cancelled = true; };
  }, [open, siteId, metric]);

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h3 style={{margin:0}}>Metric: {metric}</h3>
          <button onClick={onClose} aria-label="Close">Close</button>
        </div>
        <div style={{height:300, marginTop:12}}>
          {loading && <div>Loading…</div>}
          {!loading && data && data.length === 0 && <div>No chart data available.</div>}
          {!loading && data && data.length > 0 && <SVGLineChart series={data} />}
        </div>
      </div>
    </div>
  );
}

function SVGLineChart({ series }) {
  // series: array of { ts, value } or numbers
  const values = series.map(s => (typeof s === "object" ? Number(String(s.value || s)) : Number(s))).filter(v=>!isNaN(v));
  const w = 560, h = 220, pad = 24;
  const min = Math.min(...values), max = Math.max(...values);
  const points = values.map((v,i)=>{
    const x = pad + (i / Math.max(1, values.length-1)) * (w - pad*2);
    const y = pad + (1 - (v - min) / Math.max(1, max - min)) * (h - pad*2);
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width={w} height={h} fill="#fff" stroke="#e6e7eb" />
      <polyline fill="none" stroke="#0ea5a4" strokeWidth="2" points={points} />
      {/* x/y axes or labels could be added here */}
    </svg>
  );
}

const overlayStyle = { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 };
const modalStyle = { width:'min(92vw,700px)', background:'#fff', padding:18, borderRadius:8, boxShadow:'0 10px 30px rgba(2,6,23,0.2)' };
