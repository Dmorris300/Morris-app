import { Link } from "react-router-dom";
import { Shield } from "lucide-react";

export default function PrivacyPolicy() {
  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto" data-testid="page-privacy">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2 flex items-center gap-2"><Shield size={14} /> Account</div>
        <h1 className="font-display text-4xl md:text-5xl">Privacy Policy</h1>
        <div className="h-[2px] w-24 bg-[#E8A020] mt-4" />
      </div>

      <div className="card-dark p-6 md:p-8 space-y-6 text-[#F0EDE8]">
        <p className="text-[#A19D94]">
          Our full privacy policy is available at <a href="https://morrisapp.co.uk/privacy" className="text-[#E8A020] hover:underline">morrisapp.co.uk/privacy</a>. This page will be updated with our complete ICO compliant privacy policy shortly.
        </p>

        <div>
          <h2 className="font-display text-2xl text-[#E8A020] mb-3">Third Party Services</h2>
          <p className="text-[#F0EDE8] mb-3">Morris uses the following third party services which may process your data.</p>
          <ul className="space-y-2 text-[#A19D94] text-sm">
            <li><strong className="text-[#F0EDE8]">Document generation service</strong> a third-party provider processes your document prompts to produce the document content.</li>
            <li><strong className="text-[#F0EDE8]">Emergent</strong> hosts the Morris application and serves it to your device.</li>
            <li><strong className="text-[#F0EDE8]">Stripe</strong> processes payment information for paid subscriptions.</li>
            <li><strong className="text-[#F0EDE8]">Resend</strong> delivers transactional emails such as password resets and receipts.</li>
          </ul>
          <p className="text-[#A19D94] text-sm mt-3">Each of these providers has their own privacy policy and data processing terms. All providers are GDPR compliant.</p>
        </div>

        <div>
          <h2 className="font-display text-2xl text-[#E8A020] mb-3">Contact</h2>
          <p className="text-[#A19D94]">For any data protection questions email <a className="text-[#E8A020] hover:underline" href="mailto:hello@morrisapp.co.uk">hello@morrisapp.co.uk</a>.</p>
          <p className="text-xs text-[#706D66] mt-3">Morris Construction Tech Ltd &nbsp;&middot;&nbsp; ICO Registration C1923529</p>
        </div>

        <div className="pt-4 border-t border-[#F0EDE8]/10">
          <Link to="/app" className="text-[#E8A020] text-sm hover:underline">Back to app</Link>
        </div>
      </div>
    </div>
  );
}
