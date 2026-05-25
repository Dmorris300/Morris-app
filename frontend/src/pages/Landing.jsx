import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { MorrisLogo, MorrisWordmark } from "../components/MorrisLogo";
import CinematicIntro from "../components/CinematicIntro";
import { ArrowRight, Mic, Camera, Calculator, ShieldCheck, FileText, HardHat, PoundSterling, CheckCircle2 } from "lucide-react";
import { TOOLS, SECTIONS, emojiFor } from "../lib/tools-config";

const HERO_BG = "https://static.prod-images.emergentagent.com/jobs/64edf71d-3747-4105-a860-131b2bbabbfc/images/6520f329423ee4325e55202f82398164ec577f7cf4314c84a9b8b8e449e90525.png";
const SITE_PHOTO = "https://images.unsplash.com/photo-1518280651110-3e80e7c84a84?auto=format&fit=crop&w=1600&q=70";
const FOUNDER_PHOTO = "https://images.unsplash.com/photo-1646324554833-f0b6a479fa5d?auto=format&fit=crop&w=1400&q=70";

export default function Landing() {
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && !sessionStorage.getItem("morris_intro_shown")) {
      setShowIntro(true);
    }
  }, []);

  const dismissIntro = () => {
    sessionStorage.setItem("morris_intro_shown", "1");
    setShowIntro(false);
  };

  return (
    <div className="min-h-screen bg-[#060606] text-[#F0EDE8] font-body" data-testid="landing-page">
      {showIntro && <CinematicIntro onDone={dismissIntro} />}
      {/* NAV */}
      <nav className="sticky top-0 z-40 bg-[#060606]/90 backdrop-blur border-b border-[#F0EDE8]/5">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" data-testid="nav-home">
            <MorrisLogo size={36} />
            <MorrisWordmark size="text-2xl" />
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-[#A19D94]">
            <a href="#tools" className="hover:text-[#F0EDE8]">Tools</a>
            <a href="#wow" className="hover:text-[#F0EDE8]">What Morris Offers</a>
            <a href="#pricing" className="hover:text-[#F0EDE8]">Pricing</a>
            <a href="#founder" className="hover:text-[#F0EDE8]">Founder</a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-[#F0EDE8] hover:text-[#E8A020]" data-testid="nav-login">Log in</Link>
            <Link to="/signup" className="btn-primary text-sm" data-testid="nav-signup">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-[#F0EDE8]/5">
        <div className="absolute inset-0 opacity-50" style={{ backgroundImage: `url(${HERO_BG})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="absolute inset-0 bg-gradient-to-br from-[#060606] via-[#060606]/80 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-6 py-24 md:py-36 grid md:grid-cols-12 gap-12 items-center">
          <div className="md:col-span-7">
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 border border-[#E8A020]/30 rounded-full text-[#E8A020] text-xs uppercase tracking-widest">
              <span className="w-1.5 h-1.5 bg-[#E8A020] rounded-full" /> Built on the Tools
            </div>
            <h1 className="font-display text-6xl md:text-8xl leading-[0.9] tracking-tight">
              Paperwork.<br/>
              <span className="text-[#E8A020]">Sorted.</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-[#A19D94] max-w-xl leading-relaxed">
              Morris is the construction admin app built by a UK duct fitter. for tradesmen and sole traders who'd rather be on the tools than chasing paperwork.
            </p>
            <p className="mt-3 text-base text-[#706D66] italic">Built by a tradesman. For tradesmen.</p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link to="/signup" className="btn-primary flex items-center gap-2" data-testid="hero-cta-signup">
                Start free <ArrowRight size={16} />
              </Link>
              <a href="#tools" className="btn-secondary">See the tools</a>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-[#A19D94]">
              <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#E8A020]" /> 90+ trade-specific tools</span>
              <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#E8A020]" /> UK CIS, HMRC & HSE aware</span>
              <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#E8A020]" /> Generates PDFs on your phone</span>
            </div>
          </div>
          <div className="md:col-span-5 hidden md:block">
            <div className="card-dark p-1 morris-grain">
              <div className="aspect-[4/5] bg-cover bg-center rounded-md" style={{ backgroundImage: `url(${SITE_PHOTO})` }} />
            </div>
          </div>
        </div>
      </section>

      {/* WOW FEATURES */}
      <section id="wow" className="border-b border-[#F0EDE8]/5">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="max-w-3xl mb-14">
            <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-4">Three things no other admin app does</div>
            <h2 className="font-display text-5xl md:text-6xl">What sets Morris apart.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <WowCard icon={<Mic size={28} />} title="Verbal to Variation" desc="Talk into your phone. Morris turns 'the foreman told me to add another riser' into a formal variation letter you can send before you get back to the van." />
            <WowCard icon={<Camera size={28} />} title="Photo to Document" desc="Snap a handwritten scrap of paper. Morris reads it, formats it, and gives you a clean professional document." />
            <WowCard icon={<Calculator size={28} />} title="CIS Refund Predictor" desc="Log every CIS deduction once. See a real-time running prediction of what HMRC owes you at year end." />
          </div>
        </div>
      </section>

      {/* TOOLS GRID */}
      <section id="tools" className="border-b border-[#F0EDE8]/5 morris-grid-bg">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="flex items-end justify-between flex-wrap gap-6 mb-12">
            <div>
              <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-3">Everything you need</div>
              <h2 className="font-display text-5xl md:text-6xl">{TOOLS.length}+ tools.<br/>One toolbox.</h2>
            </div>
            <p className="max-w-md text-[#A19D94]">From RAMS and CIS invoices to Extension of Time claims and Retention chasers. organised the way a tradesman actually works.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {SECTIONS.filter(s => s.id !== "account").map((s) => {
              const list = TOOLS.filter(t => t.section === s.id).slice(0, 8);
              return (
                <div key={s.id} className="card-dark p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <SectionIcon id={s.id} />
                    <h3 className="font-display text-2xl tracking-wide">{s.label}</h3>
                  </div>
                  <ul className="space-y-2 text-sm text-[#A19D94]">
                    {list.map(t => <li key={t.id} className="flex items-start gap-2"><span className="text-sm leading-tight">{emojiFor(t.id)}</span> {t.name}</li>)}
                    {TOOLS.filter(t => t.section === s.id).length > 8 && (
                      <li className="text-[#706D66] italic pt-1">+ {TOOLS.filter(t => t.section === s.id).length - 8} more</li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="border-b border-[#F0EDE8]/5">
        <div className="max-w-7xl mx-auto px-6 py-24">
          <div className="text-center mb-14">
            <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-3">Pricing</div>
            <h2 className="font-display text-5xl md:text-6xl">Simple pricing. Pay monthly.</h2>
          </div>
          <div className="grid md:grid-cols-5 gap-4">
            <PriceCard tier="Free" price="£0" period="forever" features={["3 tools", "5 documents per month", "Get a feel for Morris"]} cta="Start free" ctaTo="/signup" />
            <PriceCard tier="Solo" price="£12.99" period="per month" features={["All tools", "Unlimited documents", "1 user"]} cta="Choose Solo" highlight ctaTo="/signup" />
            <PriceCard tier="Pro" price="£24.99" period="per month" features={["Everything in Solo", "3 users", "Shared document history"]} cta="Choose Pro" ctaTo="/signup" />
            <PriceCard tier="Business" price="£59.99" period="per month" features={["Everything in Pro", "10 users", "Multi-site management"]} cta="Choose Business" ctaTo="/signup" />
            <PriceCard tier="Enterprise" price="£199.99" period="per month" features={["Unlimited users", "White label available", "Priority support"]} cta="Contact us" ctaTo="mailto:hello@morrisapp.co.uk?subject=Morris Enterprise" external />
          </div>
        </div>
      </section>

      {/* FOUNDER */}
      <section id="founder" className="border-b border-[#F0EDE8]/5">
        <div className="max-w-4xl mx-auto px-6 py-24 text-center">
          <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-4">Founder</div>
          <h2 className="font-display text-5xl md:text-6xl mb-6">Built by Darren.<br/>A duct fitter.</h2>
          <p className="text-lg text-[#A19D94] leading-relaxed mb-4">
            I'm Darren, a UK duct fitter. I got tired of watching good tradesmen get shafted by bad paperwork.
            Verbal instructions were never confirmed, variations were never priced, CIS refunds were never claimed.
          </p>
          <p className="text-lg text-[#A19D94] leading-relaxed mb-4">
            I built Morris to fix the problems I saw every day on site.
          </p>
          <p className="text-lg text-[#A19D94] leading-relaxed">
            Built by someone who's actually been on site.
          </p>
          <p className="mt-6 font-display text-3xl text-[#E8A020]">Built on the Tools.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#060606]">
        <div className="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-4 gap-10">
          <div>
            <div className="flex items-center gap-3 mb-4"><MorrisLogo size={36} /><MorrisWordmark size="text-2xl" /></div>
            <p className="text-sm text-[#A19D94]">Built by a tradesman. For tradesmen.</p>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Product</div>
            <ul className="space-y-2 text-sm text-[#A19D94]">
              <li><a href="#tools">Tools</a></li>
              <li><a href="#wow">What Morris Offers</a></li>
              <li><a href="#pricing">Pricing</a></li>
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Company</div>
            <ul className="space-y-2 text-sm text-[#A19D94]">
              <li>Morris Construction Tech Ltd</li>
              <li>ICO Reg. C1923529</li>
              <li>morrisapp.co.uk</li>
              <li>hello@morrisapp.co.uk</li>
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-3">Get started</div>
            <Link to="/signup" className="btn-primary inline-flex items-center gap-2" data-testid="footer-cta-signup">Start free <ArrowRight size={16} /></Link>
          </div>
        </div>
        <div className="border-t border-[#F0EDE8]/5">
          <div className="max-w-7xl mx-auto px-6 py-6 text-xs text-[#706D66] flex flex-wrap justify-between gap-3">
            <span>© {new Date().getFullYear()} Morris Construction Tech Ltd. All rights reserved.</span>
            <span>Built on the Tools.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function WowCard({ icon, title, desc }) {
  return (
    <div className="card-dark p-8 hover:border-[#E8A020]/40 transition-colors">
      <div className="text-[#E8A020] mb-5">{icon}</div>
      <h3 className="font-display text-3xl mb-3 tracking-wide">{title}</h3>
      <p className="text-[#A19D94] leading-relaxed">{desc}</p>
    </div>
  );
}

function PriceCard({ tier, price, period, features, cta, highlight, ctaTo, external }) {
  return (
    <div className={`card-dark p-6 flex flex-col ${highlight ? "border-[#E8A020]/60" : ""}`} data-testid={`pricing-${tier.toLowerCase()}`}>
      <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-2">{tier}</div>
      <div className="font-display text-5xl text-[#F0EDE8]">{price}</div>
      <div className="text-sm text-[#706D66] mb-5">{period}</div>
      <ul className="space-y-2 text-sm text-[#A19D94] mb-6 flex-1">
        {features.map((f) => <li key={f} className="flex items-start gap-2"><CheckCircle2 size={14} className="text-[#E8A020] mt-1 flex-shrink-0" /> {f}</li>)}
      </ul>
      <a href={ctaTo || "/signup"} className={highlight ? "btn-primary text-center" : "btn-secondary text-center"} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined}>{cta}</a>
    </div>
  );
}

function SectionIcon({ id }) {
  const map = {
    documents: <FileText size={20} className="text-[#E8A020]" />,
    finance: <PoundSterling size={20} className="text-[#E8A020]" />,
    site: <HardHat size={20} className="text-[#E8A020]" />,
    pricework: <Calculator size={20} className="text-[#E8A020]" />,
    soletrader: <ShieldCheck size={20} className="text-[#E8A020]" />,
    contractors: <HardHat size={20} className="text-[#E8A020]" />,
  };
  return map[id] || <FileText size={20} className="text-[#E8A020]" />;
}
