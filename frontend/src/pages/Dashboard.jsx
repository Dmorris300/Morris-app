import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import api from "../lib/api";
import { TOOLS, WOW_TOOLS, emojiFor, getToolById } from "../lib/tools-config";
import { recommendationsFor } from "../lib/trade-recommendations";
import { Star, FileText, Mic, Camera, Calculator, ArrowRight, TrendingUp, Clock, HardHat } from "lucide-react";

export default function Dashboard() {
  const { user } = useAuth();
  const [docs, setDocs] = useState([]);
  const [cis, setCis] = useState([]);

  useEffect(() => {
    api.get("/documents").then(r => setDocs(r.data)).catch(() => {});
    api.get("/cis/payments").then(r => setCis(r.data)).catch(() => {});
  }, []);

  const favs = (user?.favourites || []).map(id => [...TOOLS, ...WOW_TOOLS].find(t => t.id === id)).filter(Boolean);
  const recent = (user?.recentlyUsed || []).map(id => [...TOOLS, ...WOW_TOOLS].find(t => t.id === id)).filter(Boolean);
  const recIds = recommendationsFor(user?.trade);
  const recommended = recIds.map(id => getToolById(id)).filter(Boolean);

  const totalDeduction = cis.reduce((a, x) => a + (x.deduction || 0), 0);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto" data-testid="dashboard-page">
      <div className="mb-10">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Welcome to your toolbox</div>
        <h1 className="font-display text-5xl md:text-6xl">
          {user?.fullName ? `Hello, ${user.fullName.split(" ")[0]}.` : "Hello."}
        </h1>
        <p className="text-[#A19D94] mt-3">Your trade: <span className="text-[#F0EDE8]">{user?.trade || "Not set"}</span></p>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-10">
        <StatCard label="Documents created" value={docs.length} icon={<FileText size={18} />} to="/app/history" />
        <StatCard label="CIS deducted YTD" value={`£${totalDeduction.toLocaleString("en-GB", { minimumFractionDigits: 0 })}`} icon={<TrendingUp size={18} />} to="/app/cis-predictor" />
        <StatCard label="Favourites" value={favs.length} icon={<Star size={18} />} to="/app/favourites" />
      </div>

      <div className="mb-10">
        <h2 className="font-display text-3xl mb-4">What Morris offers</h2>
        <div className="grid md:grid-cols-3 gap-4">
          <BigCard to="/app/wow/verbal-to-variation" icon={<Mic size={24} />} title="Verbal to Variation" desc="Talk it. Send it." testId="dash-wow-verbal" />
          <BigCard to="/app/wow/photo-to-document" icon={<Camera size={24} />} title="Photo to Document" desc="Snap a scribble. Get a doc." testId="dash-wow-photo" />
          <BigCard to="/app/cis-predictor" icon={<Calculator size={24} />} title="CIS Refund Predictor" desc="See what HMRC owes you." testId="dash-wow-cis" />
        </div>
      </div>

      {user?.trade && recommended.length > 0 && (
        <div className="mb-10" data-testid="dash-recommendations">
          <div className="flex items-end justify-between flex-wrap gap-2 mb-4">
            <h2 className="font-display text-3xl flex items-center gap-3"><HardHat size={20} className="text-[#E8A020]" /> Recommended for {user.trade}</h2>
            <p className="text-xs text-[#706D66]">The paperwork most tradesmen in your trade reach for.</p>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
            {recommended.slice(0, 8).map(t => (
              <Link key={"rec-" + t.id} to={t.route || `/app/tool/${t.id}`} className="card-dark p-4 hover:border-[#E8A020]/40 transition" data-testid={`dash-rec-${t.id}`}>
                <div className="text-2xl mb-2">{emojiFor(t.id)}</div>
                <div className="text-sm font-semibold leading-tight">{t.name}</div>
                <div className="text-xs text-[#706D66] mt-1 capitalize">{t.section}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mb-10">
          <h2 className="font-display text-3xl mb-4 flex items-center gap-3"><Clock size={20} className="text-[#E8A020]" /> Recently used</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {recent.map(t => (
              <Link key={"r-" + t.id} to={t.route || `/app/tool/${t.id}`} className="card-dark p-4 hover:border-[#E8A020]/40 transition" data-testid={`dash-recent-${t.id}`}>
                <div className="text-sm font-semibold flex items-center gap-2"><span className="text-lg">{emojiFor(t.id)}</span> {t.name}</div>
                <div className="text-xs text-[#706D66] mt-1 capitalize">{t.section}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-display text-3xl mb-4 flex items-center gap-3"><Star size={20} className="text-[#E8A020]" /> Favourites</h2>
        {favs.length === 0 ? (
          <div className="card-dark p-6 text-sm text-[#706D66]">Star a tool from its header to pin it here.</div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {favs.map(t => (
              <Link key={"f-" + t.id} to={t.route || `/app/tool/${t.id}`} className="card-dark p-4 hover:border-[#E8A020]/40 transition" data-testid={`dash-fav-${t.id}`}>
                <div className="text-sm font-semibold flex items-center gap-2"><span className="text-lg">{emojiFor(t.id)}</span> {t.name}</div>
                <div className="text-xs text-[#706D66] mt-1 capitalize">{t.section}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, to }) {
  return (
    <Link to={to} className="card-dark p-6 hover:border-[#E8A020]/40 transition block">
      <div className="text-[#E8A020] flex items-center gap-2 text-xs uppercase tracking-widest mb-2">{icon}{label}</div>
      <div className="font-display text-4xl">{value}</div>
    </Link>
  );
}
function BigCard({ to, icon, title, desc, testId }) {
  return (
    <Link to={to} className="card-dark p-6 hover:border-[#E8A020]/40 transition group block" data-testid={testId}>
      <div className="text-[#E8A020] mb-3">{icon}</div>
      <div className="font-display text-2xl tracking-wide">{title}</div>
      <div className="text-sm text-[#A19D94] mt-1">{desc}</div>
      <div className="mt-3 flex items-center gap-1 text-xs text-[#E8A020] opacity-0 group-hover:opacity-100 transition">Open <ArrowRight size={12} /></div>
    </Link>
  );
}
