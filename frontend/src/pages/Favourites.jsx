import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { TOOLS, WOW_TOOLS, emojiFor } from "../lib/tools-config";
import { Star } from "lucide-react";

export default function Favourites() {
  const { user } = useAuth();
  const favs = (user?.favourites || []).map(id => [...TOOLS, ...WOW_TOOLS].find(t => t.id === id)).filter(Boolean);

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid="page-favourites">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2">Account</div>
        <h1 className="font-display text-4xl md:text-5xl">Favourites</h1>
        <p className="text-[#A19D94] mt-2">Your starred tools, one click away.</p>
      </div>
      {favs.length === 0 ? (
        <div className="card-dark p-6 text-sm text-[#706D66]">Nothing here yet — open a tool and tap the star.</div>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {favs.map(t => (
            <Link key={t.id} to={t.route || `/app/tool/${t.id}`} className="card-dark p-4 hover:border-[#E8A020]/40 transition" data-testid={`fav-${t.id}`}>
              <div className="flex items-center justify-between">
                <div className="font-semibold flex items-center gap-2"><span className="text-lg">{emojiFor(t.id)}</span> {t.name}</div>
                <Star size={14} className="text-[#E8A020]" fill="#E8A020" />
              </div>
              <div className="text-xs text-[#706D66] mt-1 capitalize">{t.section}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
