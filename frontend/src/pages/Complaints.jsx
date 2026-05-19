import { Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";

export default function Complaints() {
  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto" data-testid="page-complaints">
      <div className="mb-8">
        <div className="text-[#E8A020] text-xs uppercase tracking-widest mb-2 flex items-center gap-2"><MessageSquare size={14} /> Account</div>
        <h1 className="font-display text-4xl md:text-5xl">How to raise a complaint</h1>
        <div className="h-[2px] w-24 bg-[#E8A020] mt-4" />
      </div>
      <div className="card-dark p-6 md:p-8 text-[#F0EDE8] space-y-4 leading-relaxed">
        <p>If you have a complaint about Morris we want to hear from you.</p>
        <p>Please email <a className="text-[#E8A020] hover:underline" href="mailto:hello@morrisapp.co.uk?subject=Complaint">hello@morrisapp.co.uk</a> with the subject line <strong className="text-[#E8A020]">Complaint</strong> and describe the issue in as much detail as possible.</p>
        <p>We will acknowledge your complaint within <strong>2 working days</strong> and aim to resolve it within <strong>14 working days</strong>.</p>
        <p>If you are not satisfied with our response you may refer your complaint to the Information Commissioner's Office at <a className="text-[#E8A020] hover:underline" href="https://ico.org.uk" target="_blank" rel="noreferrer">ico.org.uk</a> for data related matters.</p>
        <div className="pt-4 border-t border-[#F0EDE8]/10">
          <Link to="/app" className="text-[#E8A020] text-sm hover:underline">Back to app</Link>
        </div>
      </div>
    </div>
  );
}
