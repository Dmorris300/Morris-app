import { Link } from "react-router-dom";

export default function AppFooter() {
  return (
    <footer
      className="mt-12 px-6 py-5"
      style={{ borderTop: "1px solid rgba(232,160,32,0.1)" }}
      data-testid="app-footer"
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
          <Link to="/app/privacy" className="text-[#706D66] hover:text-[#E8A020] transition-colors" data-testid="footer-privacy">Privacy Policy</Link>
          <Link to="/app/terms" className="text-[#706D66] hover:text-[#E8A020] transition-colors" data-testid="footer-terms">Terms and Conditions</Link>
          <a href="mailto:hello@morrisapp.co.uk" className="text-[#706D66] hover:text-[#E8A020] transition-colors" data-testid="footer-contact">Contact</a>
        </div>
        <div style={{ fontSize: 10 }} className="text-[#706D66]">
          Morris Construction Tech Ltd &nbsp;&middot;&nbsp; ICO C1923529
        </div>
      </div>
    </footer>
  );
}
