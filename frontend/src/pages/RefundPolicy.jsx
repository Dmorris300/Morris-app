import { Link } from "react-router-dom";
import { PoundSterling } from "lucide-react";

export default function RefundPolicy() {
  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto" data-testid="page-refund">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2 flex items-center gap-2"><PoundSterling size={14} /> Account</div>
        <h1 className="font-display text-4xl md:text-5xl">Refund Policy</h1>
        <div className="h-[2px] w-24 bg-[#E8A020] mt-4" />
      </div>
      <div className="card-dark p-6 md:p-8 text-[#F0EDE8] space-y-4 leading-relaxed">
        <p>Morris subscriptions are billed monthly in advance.</p>
        <p>We do not provide refunds for any unused portion of a subscription period.</p>
        <p>If you cancel your subscription your access to paid features continues until the end of your current billing period.</p>
        <p>If you believe you have been charged in error please contact <a className="text-[#E8A020] hover:underline" href="mailto:hello@morrisapp.co.uk">hello@morrisapp.co.uk</a> within 7 days of the charge and we will investigate.</p>
        <p className="text-[#A19D94] text-sm pt-2 border-t border-[#F0EDE8]/10">Nothing in this policy affects your statutory rights under UK consumer law.</p>
        <div className="pt-4">
          <Link to="/app" className="text-[#E8A020] text-sm hover:underline">Back to app</Link>
        </div>
      </div>
    </div>
  );
}
