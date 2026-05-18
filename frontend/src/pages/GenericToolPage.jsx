import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getToolById } from "../lib/tools-config";
import ToolHeader, { ResultActions } from "../components/ToolHeader";
import api from "../lib/api";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function GenericToolPage() {
  const { toolId } = useParams();
  const nav = useNavigate();
  const tool = getToolById(toolId);
  const { user, refresh } = useAuth();
  const [infoOpen, setInfoOpen] = useState(false);
  const [values, setValues] = useState({});
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState("");

  useEffect(() => { setValues({}); setResult(""); setInfoOpen(false); }, [toolId]);

  if (!tool) {
    return <div className="p-8 text-[#A19D94]">Tool not found.</div>;
  }

  // Tools that are widgets, not generic forms
  if (tool.id === "earnings-dashboard") return <RedirectTo path="/app/earnings" />;
  if (tool.id === "mileage-tracker") return <RedirectTo path="/app/mileage" />;
  if (tool.id === "vat-threshold") return <RedirectTo path="/app/vat" />;
  if (tool.id === "cis-refund-predictor") return <RedirectTo path="/app/cis-predictor" />;

  const onGenerate = async () => {
    setGenerating(true); setResult("");
    try {
      const r = await api.post("/generate", {
        toolId: tool.id,
        toolName: tool.name,
        promptTemplate: tool.promptTemplate,
        userInputs: values,
        trade: user?.trade,
        companyName: user?.companyName,
        fullName: user?.fullName,
      });
      setResult(r.data.content);
      // update recently used
      const recent = [tool.id, ...(user?.recentlyUsed || []).filter(x => x !== tool.id)].slice(0, 5);
      await api.post("/profile/update", { recentlyUsed: recent });
      await refresh();
      toast.success("Document generated");
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 402) {
        toast.error(typeof detail === "string" ? detail : "Free plan limit reached");
        nav("/app/billing");
      } else {
        toast.error(typeof detail === "string" ? detail : "Generation failed");
      }
    } finally { setGenerating(false); }
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto" data-testid={`tool-page-${tool.id}`}>
      <ToolHeader tool={tool} infoOpen={infoOpen} setInfoOpen={setInfoOpen} />

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card-dark p-6">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Inputs</div>
          <div className="space-y-4">
            {(tool.fields || []).map((field) => (
              <div key={field.name}>
                <div className="text-xs uppercase tracking-widest text-[#A19D94] mb-2">{field.label}</div>
                {field.type === "textarea" ? (
                  <textarea
                    rows={4}
                    className="input-base resize-y"
                    placeholder={field.placeholder}
                    value={values[field.name] || ""}
                    onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                    data-testid={`field-${field.name}`}
                  />
                ) : (
                  <input
                    type={field.type || "text"}
                    className="input-base"
                    placeholder={field.placeholder}
                    value={values[field.name] || ""}
                    onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
                    data-testid={`field-${field.name}`}
                  />
                )}
              </div>
            ))}
            {(!tool.fields || tool.fields.length === 0) && (
              <p className="text-sm text-[#A19D94]">No inputs needed — just hit generate. Morris will use your profile and trade.</p>
            )}
            <button onClick={onGenerate} className="btn-primary w-full flex items-center justify-center gap-2" disabled={generating} data-testid="generate-btn">
              {generating ? <><Loader2 size={16} className="animate-spin" /> Generating…</> : "Generate document"}
            </button>
          </div>
        </div>

        <div className="card-dark p-6 min-h-[400px]">
          <div className="text-xs uppercase tracking-widest text-[#E8A020] mb-4">Result</div>
          {generating && (
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-[#A19D94]">
              <div className="spinner" />
              <div className="text-sm">Morris is writing your {tool.name.toLowerCase()}…</div>
            </div>
          )}
          {!generating && !result && (
            <div className="text-sm text-[#706D66] italic">Your generated document will appear here.</div>
          )}
          {result && (
            <>
              <div className="tool-result text-sm" data-testid="generated-content">{result}</div>
              <ResultActions title={tool.name} content={result} toolId={tool.id} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RedirectTo({ path }) {
  const nav = useNavigate();
  useEffect(() => { nav(path, { replace: true }); }, [path]);
  return null;
}
