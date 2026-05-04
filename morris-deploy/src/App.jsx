import { useState, useRef, useEffect } from "react";

const TRADES = ["Bricklayer","Carpenter","Dry Liner","Duct Fitter","Electrician","Gas Engineer","General Builder","Ground Worker","Painter & Decorator","Pipefitter","Plasterer","Plumber","Roofer","Scaffolder","Steel Erector"];

const TOOLS = [
  { id:"variation",   label:"Variation Letter",   icon:"📋", section:"Documents" },
  { id:"rams",        label:"RAMS",                icon:"⚠️", section:"Documents" },
  { id:"diary",       label:"Site Diary",          icon:"📅", section:"Documents" },
  { id:"quote",       label:"Quote Builder",       icon:"💷", section:"Documents" },
  { id:"invoice",     label:"Invoice",             icon:"🧾", section:"Documents" },
  { id:"delay",       label:"Delay Notice",        icon:"⏱️", section:"Documents" },
  { id:"handover",    label:"Handover Cert",       icon:"✅", section:"Documents" },
  { id:"subcontract", label:"Subcontract Letter",  icon:"🤝", section:"Documents" },
  { id:"complaint",   label:"Complaint Letter",    icon:"📣", section:"Documents" },
  { id:"timesheet",   label:"Timesheet",           icon:"🕐", section:"Documents" },
  { id:"chaser",      label:"Payment Chaser",      icon:"💬", section:"Finance" },
  { id:"cis",         label:"CIS Calculator",      icon:"🧮", section:"Finance" },
  { id:"selfassess",  label:"Self Assessment Prep",icon:"📊", section:"Finance" },
  { id:"pricequote",  label:"Price Work Quote",    icon:"💰", section:"Finance" },
  { id:"earnings",    label:"Earnings Dashboard",  icon:"📈", section:"Finance" },
  { id:"photos",      label:"Photo Evidence Log",  icon:"📸", section:"Site Tools" },
  { id:"verbal",      label:"Verbal Instruction",  icon:"🎙️", section:"Site Tools" },
  { id:"contract",    label:"Contract Review",     icon:"🔍", section:"Site Tools" },
  { id:"dispute",     label:"Dispute Timeline",    icon:"⚖️", section:"Site Tools" },
  { id:"incident",    label:"Incident Report",     icon:"🚨", section:"Site Tools" },
  { id:"reminders",   label:"Reminders",           icon:"🔔", section:"Site Tools" },
  { id:"toolboxtalk",  label:"Toolbox Talk",        icon:"🦺", section:"Site Tools" },
  { id:"asbestos",    label:"Asbestos Record",     icon:"☣️", section:"Site Tools" },
  { id:"snagging",    label:"Snagging List",       icon:"🔧", section:"Site Tools" },
  { id:"hmrc",        label:"HMRC Correspondence", icon:"🏦", section:"Sole Trader" },
  { id:"reference",   label:"Reference Letter",    icon:"📝", section:"Sole Trader" },
  { id:"rateincrease",label:"Rate Increase Letter",icon:"💷", section:"Sole Trader" },
  { id:"apprentice",  label:"Apprentice Manager",  icon:"🎓", section:"Sole Trader" },
  { id:"subcomanage", label:"Subcontractor Mgmt",  icon:"👥", section:"Firms" },
  { id:"vartracker",  label:"Variation Tracker",   icon:"📉", section:"Firms" },
  { id:"ramslibrary", label:"RAMS Library",        icon:"📚", section:"Firms" },
  { id:"contractmgmt",label:"Contract Management", icon:"📄", section:"Firms" },
  { id:"multidiary",  label:"Multi-user Diary",    icon:"📋", section:"Firms" },
  { id:"paytracker",  label:"Payment Tracker",     icon:"💳", section:"Firms" },
  { id:"incidentlog", label:"Incident Log",        icon:"🗂️", section:"Firms" },
  { id:"history",     label:"Doc History",         icon:"📁", section:"Account" },
  { id:"profile",     label:"My Profile",          icon:"👤", section:"Account" },
];

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d0d0d}
  .app{min-height:100vh;background:#0d0d0d;color:#f0ede8;font-family:'DM Sans',sans-serif;font-size:14px}
  .header{background:#111;border-bottom:1px solid #1e1e1e;padding:0 20px;display:flex;align-items:center;justify-content:space-between;height:54px;position:sticky;top:0;z-index:100}
  .logo{font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:3px}.logo span{color:#e8a020}
  .header-right{display:flex;align-items:center;gap:10px}
  .trade-pill{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:20px;padding:5px 12px;font-size:11px;color:#aaa;cursor:pointer;transition:all .2s}
  .trade-pill:hover{border-color:#e8a020;color:#e8a020}
  .layout{display:flex;min-height:calc(100vh - 54px)}
  .sidebar{width:195px;background:#111;border-right:1px solid #1a1a1a;padding:12px 0;flex-shrink:0;overflow-y:auto}
  .sec-label{font-size:9px;letter-spacing:2px;color:#444;padding:12px 16px 5px;text-transform:uppercase;border-top:1px solid #1a1a1a;margin-top:4px}
  .sec-label:first-child{border-top:none;margin-top:0}
  .nav-item{display:flex;align-items:center;gap:9px;padding:8px 16px;cursor:pointer;transition:all .15s;border-left:2px solid transparent;font-size:12px;color:#666}
  .nav-item:hover{color:#f0ede8;background:#161616}
  .nav-item.active{color:#f0ede8;background:#161616;border-left-color:#e8a020}
  .nav-icon{font-size:13px;width:18px;text-align:center;flex-shrink:0}
  .nav-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .main{flex:1;padding:28px 32px;max-width:820px;overflow-y:auto}
  .tool-title{font-family:'Bebas Neue',sans-serif;font-size:34px;letter-spacing:2px;line-height:1;margin-bottom:3px}
  .tool-sub{font-size:12px;color:#555;margin-bottom:22px}.tool-sub span{color:#e8a020}
  .card{background:#141414;border:1px solid #1e1e1e;border-radius:8px;padding:22px;margin-bottom:14px}
  .fl{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#555;margin-bottom:5px}
  .fi{width:100%;background:#0d0d0d;border:1px solid #222;border-radius:6px;padding:9px 12px;color:#f0ede8;font-family:'DM Sans',sans-serif;font-size:13px;outline:none;transition:border-color .2s;margin-bottom:14px}
  .fi:focus{border-color:#e8a020}.fi::placeholder{color:#383838}
  textarea.fi{resize:vertical;min-height:80px}
  .row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
  .btn{background:#e8a020;color:#0d0d0d;border:none;border-radius:6px;padding:11px 24px;font-family:'Bebas Neue',sans-serif;font-size:17px;letter-spacing:2px;cursor:pointer;transition:all .2s;width:100%}
  .btn:hover{background:#f0b030;transform:translateY(-1px)}.btn:disabled{background:#252525;color:#555;cursor:not-allowed;transform:none}
  .btn-sm{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:5px;padding:7px 14px;color:#aaa;font-size:12px;cursor:pointer;transition:all .2s;white-space:nowrap}
  .btn-sm:hover{border-color:#555;color:#f0ede8}
  .btn-danger{background:#2a0a0a;border:1px solid #5a1a1a;border-radius:5px;padding:5px 10px;color:#e05050;font-size:11px;cursor:pointer;transition:all .2s}
  .btn-danger:hover{background:#3a1010}
  .btn-red{background:#c0392b;color:#fff;border:none;border-radius:5px;padding:10px 20px;font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:1px;cursor:pointer;transition:all .2s}
  .btn-red:hover{background:#e74c3c}
  .output-box{background:#0a0a0a;border:1px solid #1e1e1e;border-radius:8px;padding:22px;margin-top:16px;white-space:pre-wrap;font-size:13px;line-height:1.75;color:#bbb}
  .out-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #1a1a1a;flex-wrap:wrap;gap:8px}
  .out-label{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#e8a020}
  .out-actions{display:flex;gap:6px;flex-wrap:wrap}
  .copy-btn{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:4px;padding:4px 10px;color:#888;font-size:11px;cursor:pointer;transition:all .2s}
  .copy-btn:hover{background:#222;color:#f0ede8}
  .save-btn{background:#1a1400;border:1px solid #e8a02040;border-radius:4px;padding:4px 10px;color:#e8a020;font-size:11px;cursor:pointer}
  .pdf-btn{background:#0d1a2a;border:1px solid #1a3a5a;border-radius:4px;padding:4px 10px;color:#4090d0;font-size:11px;cursor:pointer;transition:all .2s}
  .pdf-btn:hover{background:#142030}
  .wa-btn{background:#0d2a0d;border:1px solid #1a5a1a;border-radius:4px;padding:4px 10px;color:#25d366;font-size:11px;cursor:pointer;transition:all .2s}
  .wa-btn:hover{background:#142014}
  .email-btn{background:#1a1a2a;border:1px solid #2a2a5a;border-radius:4px;padding:4px 10px;color:#7070d0;font-size:11px;cursor:pointer;transition:all .2s}
  .email-btn:hover{background:#141424}
  .loading{display:flex;align-items:center;gap:10px;color:#555;font-size:13px;padding:18px 0}
  .spin{width:15px;height:15px;border:2px solid #222;border-top-color:#e8a020;border-radius:50%;animation:spin .7s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:200;display:flex;align-items:center;justify-content:center}
  .modal{background:#141414;border:1px solid #222;border-radius:12px;padding:28px;width:360px;max-height:85vh;overflow-y:auto}
  .modal h2{font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:2px;margin-bottom:5px}
  .modal p{color:#555;font-size:12px;margin-bottom:18px}
  .trade-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:16px}
  .trade-opt{background:#0d0d0d;border:1px solid #222;border-radius:6px;padding:9px 10px;cursor:pointer;font-size:12px;color:#888;transition:all .15s;text-align:center}
  .trade-opt:hover,.trade-opt.sel{border-color:#e8a020;color:#e8a020;background:#1a1400}
  .confirm-btn{background:#e8a020;color:#0d0d0d;border:none;border-radius:6px;padding:10px;width:100%;font-family:'Bebas Neue',sans-serif;font-size:15px;letter-spacing:2px;cursor:pointer}
  .cis-result{background:#0d0d0d;border:1px solid #1e1e1e;border-radius:8px;padding:20px;margin-top:16px}
  .cis-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #141414;font-size:13px}
  .cis-row:last-child{border-bottom:none;font-weight:600;font-size:15px;padding-top:12px}
  .cis-label{color:#777}
  .hist-empty{color:#555;font-size:13px;padding:30px 0;text-align:center;line-height:1.8}
  .hist-item{background:#141414;border:1px solid #1a1a1a;border-radius:8px;padding:14px 16px;margin-bottom:10px}
  .hist-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}
  .hist-tool{font-size:12px;color:#e8a020;font-weight:500}
  .hist-date{font-size:11px;color:#444}
  .hist-preview{font-size:12px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tag{display:inline-block;background:#1a1400;border:1px solid #e8a02030;border-radius:3px;padding:1px 7px;font-size:10px;color:#e8a020;letter-spacing:1px}
  .info-box{background:#0d1a0d;border:1px solid #1a3a1a;border-radius:6px;padding:12px 14px;font-size:12px;color:#777;line-height:1.6;margin-bottom:14px}
  .info-box strong{color:#4caf50}
  .warn-box{background:#1a0d00;border:1px solid #3a2000;border-radius:6px;padding:12px 14px;font-size:12px;color:#888;line-height:1.6;margin-bottom:14px}
  .warn-box strong{color:#e8a020}
  .divider{height:1px;background:#1a1a1a;margin:14px 0}
  .profile-saved{color:#4caf50;font-size:12px;margin-top:8px}
  .upload-zone{border:2px dashed #2a2a2a;border-radius:8px;padding:28px;text-align:center;cursor:pointer;transition:all .2s;margin-bottom:16px}
  .upload-zone:hover{border-color:#e8a020;background:#0d0d00}
  .upload-zone p{color:#555;font-size:12px;margin-top:8px}
  .table-wrap{overflow-x:auto;margin-top:16px}
  table{width:100%;border-collapse:collapse;font-size:12px}
  th{background:#141414;color:#e8a020;padding:10px 12px;text-align:left;font-size:10px;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #1e1e1e}
  td{padding:10px 12px;border-bottom:1px solid #141414;color:#ccc;vertical-align:middle}
  tr:hover td{background:#0d0d0d}
  .status-pill{display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:600;letter-spacing:.5px}
  .status-green{background:#0d2a0d;color:#4caf50;border:1px solid #1a5a1a}
  .status-amber{background:#1a1400;color:#e8a020;border:1px solid #3a2a00}
  .status-red{background:#2a0a0a;color:#e05050;border:1px solid #5a1a1a}
  .status-grey{background:#1a1a1a;color:#666;border:1px solid #2a2a2a}
  .dashboard-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
  .dash-card{background:#141414;border:1px solid #1e1e1e;border-radius:8px;padding:18px}
  .dash-num{font-family:'Bebas Neue',sans-serif;font-size:30px;color:#e8a020;letter-spacing:2px;line-height:1}
  .dash-label{font-size:11px;color:#555;margin-top:4px}
  .expense-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #141414}
  .expense-row:last-child{border-bottom:none}
  .expense-cat{font-size:11px;color:#888;width:120px;flex-shrink:0}
  .expense-desc{flex:1;font-size:12px;color:#ccc}
  .expense-amt{font-size:13px;color:#e8a020;font-weight:600;white-space:nowrap}
  .record-btn{width:80px;height:80px;border-radius:50%;border:none;cursor:pointer;font-size:28px;transition:all .3s;margin:0 auto;display:block}
  .record-btn.idle{background:#1a1a1a;border:3px solid #333}
  .record-btn.recording{background:#c0392b;border:3px solid #e74c3c;animation:pulse 1s infinite}
  @keyframes pulse{0%{box-shadow:0 0 0 0 rgba(192,57,43,.4)}70%{box-shadow:0 0 0 15px rgba(192,57,43,0)}100%{box-shadow:0 0 0 0 rgba(192,57,43,0)}}
  .transcript-box{background:#0a0a0a;border:1px solid #1e1e1e;border-radius:8px;padding:16px;margin-top:16px;font-size:13px;color:#ccc;line-height:1.7;min-height:80px}
  .bar-chart{display:flex;align-items:flex-end;gap:8px;height:120px;margin-top:16px}
  .bar-wrap{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px}
  .bar{width:100%;background:#e8a020;border-radius:3px 3px 0 0;transition:height .3s;min-height:4px}
  .bar-label{font-size:10px;color:#555;text-align:center}
  .bar-val{font-size:10px;color:#e8a020;text-align:center}
  .logo-preview{width:80px;height:80px;border-radius:8px;object-fit:contain;background:#0d0d0d;border:1px solid #222;padding:4px}
  .logo-upload-zone{border:2px dashed #2a2a2a;border-radius:8px;padding:20px;text-align:center;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:16px;margin-bottom:14px}
  .logo-upload-zone:hover{border-color:#e8a020}
`;

const toolConfigs = {
  variation:{title:"Variation Letter",sub:"Professional variation order letter",fields:[{id:"project",label:"Project Name / Address",ph:"e.g. Unit 4, Trafford Park"},{id:"contractor",label:"Main Contractor",ph:"e.g. Balfour Beatty"},{id:"description",label:"Description of Variation Works",ph:"Describe the additional works..."},{id:"cost",label:"Estimated Cost (£)",ph:"e.g. 1,250"},{id:"reason",label:"Reason / Instruction Received From",ph:"e.g. Site manager instructed verbally on..."}],prompt:(f,t,p)=>`Write a professional variation order letter from a ${t} subcontractor.\nFrom: ${p.name||"[Name]"}, ${p.company||"[Company]"}, UTR: ${p.utr||"[UTR]"}\nProject: ${f.project}, Contractor: ${f.contractor}\nWorks: ${f.description}, Cost: £${f.cost}, Reason: ${f.reason}\nFormal, professional. Reference number, date placeholder, signature block.`},
  rams:{title:"RAMS",sub:"Risk Assessment & Method Statement",fields:[{id:"task",label:"Task / Activity",ph:"e.g. Ductwork installation at high level"},{id:"location",label:"Site Location",ph:"e.g. Level 3, Block B"},{id:"hazards",label:"Main Hazards",ph:"e.g. Working at height, manual handling..."},{id:"controls",label:"Control Measures",ph:"e.g. MEWP, PPE, spotter in place..."}],prompt:(f,t,p)=>`Write a professional RAMS for a ${t}.\nCompany: ${p.company||"[Company]"}\nTask: ${f.task}, Location: ${f.location}\nHazards: ${f.hazards}, Controls: ${f.controls}\nInclude: scope, sequence, hazard table with risk ratings, PPE list, emergency procedures, sign-off box.`},
  diary:{title:"Site Diary",sub:"Daily site record — your legal protection",fields:[{id:"date",label:"Date",ph:"e.g. 18 April 2026"},{id:"site",label:"Site / Project",ph:"e.g. Salford Royal Phase 2"},{id:"workers",label:"Workers on Site",ph:"e.g. 3 duct fitters"},{id:"works",label:"Works Carried Out",ph:"Describe what was done today..."},{id:"issues",label:"Issues / Delays / Instructions",ph:"Any problems or verbal instructions..."}],prompt:(f,t,p)=>`Write a professional site diary entry for a ${t} subcontractor.\nCompany: ${p.company||"[Company]"}\nDate: ${f.date}, Site: ${f.site}, Workers: ${f.workers}\nWorks: ${f.works}, Issues: ${f.issues}\nProfessional daily record format with weather placeholder and signature block.`},
  quote:{title:"Quote Builder",sub:"Professional quotation document",fields:[{id:"client",label:"Client / Company",ph:"e.g. ABC Construction Ltd"},{id:"project",label:"Project Description",ph:"e.g. Mechanical services floors 1-3"},{id:"scope",label:"Scope of Works",ph:"Detail what is included..."},{id:"price",label:"Total Price (£)",ph:"e.g. 8,500"},{id:"exclusions",label:"Exclusions",ph:"e.g. Commissioning, fire stopping..."}],prompt:(f,t,p)=>`Write a professional quotation from a ${t} subcontractor.\nFrom: ${p.name||"[Name]"}, ${p.company||"[Company]"}\nClient: ${f.client}, Project: ${f.project}\nScope: ${f.scope}, Price: £${f.price}, Exclusions: ${f.exclusions}\nInclude: quote reference, 30-day validity, payment terms, assumptions, sign-off.`},
  invoice:{title:"Invoice",sub:"CIS-compliant invoice",fields:[{id:"client",label:"Invoice To",ph:"e.g. Main Contractor Ltd"},{id:"works",label:"Works Description",ph:"e.g. Ductwork installation w/e 18/04/26"},{id:"amount",label:"Invoice Amount (£)",ph:"e.g. 3,200"}],prompt:(f,t,p)=>`Write a professional CIS invoice for a ${t} subcontractor.\nFrom: ${p.name||"[Name]"}, ${p.company||"[Company]"}, UTR: ${p.utr||"[UTR]"}\nBank: ${p.bankName||"[Name]"}, Sort: ${p.sortCode||"[Sort]"}, Acc: ${p.accNum||"[Acc]"}\nTo: ${f.client}, Works: ${f.works}, Amount: £${f.amount}\nInclude: invoice number, date, labour breakdown, CIS 20% deduction, net payable, VAT note.`},
  delay:{title:"Delay Notice",sub:"Protect yourself from programme delays",fields:[{id:"project",label:"Project",ph:"e.g. New build, Salford"},{id:"contractor",label:"Main Contractor",ph:"e.g. Kier Construction"},{id:"cause",label:"Cause of Delay",ph:"e.g. No access to floor 4..."},{id:"impact",label:"Impact on Programme",ph:"e.g. 3 days lost, completion pushed to 25th April"}],prompt:(f,t,p)=>`Write a formal delay notice from a ${t} subcontractor.\nFrom: ${p.company||"[Company]"}, Project: ${f.project}, Contractor: ${f.contractor}\nCause: ${f.cause}, Impact: ${f.impact}\nFormal, protective. Reference right to claim loss and expense. Date and signature block.`},
  handover:{title:"Handover Certificate",sub:"Formal completion document",fields:[{id:"project",label:"Project Name",ph:"e.g. Commercial fit-out, Manchester"},{id:"works",label:"Works Completed",ph:"e.g. Mechanical ductwork floors 1-5"},{id:"date",label:"Handover Date",ph:"e.g. 18 April 2026"},{id:"defects",label:"Outstanding Items",ph:"e.g. None"}],prompt:(f,t,p)=>`Write a professional handover certificate for a ${t} subcontractor.\nCompany: ${p.company||"[Company]"}, Project: ${f.project}\nWorks: ${f.works}, Date: ${f.date}, Outstanding: ${f.defects}\nInclude: practical completion, 12-month defects liability, O&M note, client sign-off.`},
  subcontract:{title:"Subcontract Letter",sub:"Letter of intent or subcontract award",fields:[{id:"subcontractor",label:"Subcontractor Name",ph:"e.g. Smith Ductwork Ltd"},{id:"works",label:"Scope of Works",ph:"e.g. Supply and fix ductwork level 2..."},{id:"value",label:"Value (£)",ph:"e.g. 12,000"},{id:"start",label:"Start Date",ph:"e.g. 28 April 2026"},{id:"terms",label:"Payment Terms",ph:"e.g. Monthly valuations, 30 days"}],prompt:(f,t,p)=>`Write a professional subcontract appointment letter from a ${t} contractor.\nFrom: ${p.company||"[Company]"}, Subcontractor: ${f.subcontractor}\nWorks: ${f.works}, Value: £${f.value}, Start: ${f.start}, Terms: ${f.terms}\nInclude: scope, programme, insurance, CIS obligations, 5% retention, signature blocks.`},
  complaint:{title:"Complaint Letter",sub:"Formal complaint or dispute letter",fields:[{id:"recipient",label:"Recipient / Company",ph:"e.g. ABC Main Contractors Ltd"},{id:"issue",label:"Nature of Complaint",ph:"e.g. Payment withheld without reason..."},{id:"resolution",label:"Resolution Sought",ph:"e.g. Full payment of £4,500 within 7 days"},{id:"history",label:"Previous Attempts",ph:"e.g. Emailed 3 times, called twice..."}],prompt:(f,t,p)=>`Write a formal complaint letter from a ${t} subcontractor.\nFrom: ${p.name||"[Name]"}, ${p.company||"[Company]"}\nTo: ${f.recipient}, Issue: ${f.issue}, Resolution: ${f.resolution}, History: ${f.history}\nFirm, professional, legally aware. Construction Act reference if payment. 7-day deadline. Mention adjudication.`},
  timesheet:{title:"Timesheet",sub:"Weekly timesheet for labour records",fields:[{id:"worker",label:"Worker Name",ph:"e.g. D. Morris"},{id:"week",label:"Week Ending",ph:"e.g. 18 April 2026"},{id:"project",label:"Project / Site",ph:"e.g. Salford Royal Phase 2"},{id:"hours",label:"Hours Mon–Sun",ph:"e.g. Mon 8, Tue 8, Wed 8, Thu 8, Fri 8, Sat 4, Sun 0"},{id:"rate",label:"Day Rate (£)",ph:"e.g. 220"}],prompt:(f,t,p)=>`Generate a professional weekly timesheet for a ${t}.\nWorker: ${f.worker||p.name||"[Name]"}, Company: ${p.company||"[Company]"}\nWeek ending: ${f.week}, Project: ${f.project}, Hours: ${f.hours}, Rate: £${f.rate}/day\nTable with daily breakdown, total hours, total value, overtime flag if over 40hrs, signature lines.`},
  hmrc:{title:"HMRC Correspondence",sub:"Respond to HMRC professionally and correctly",fields:[{id:"reference",label:"HMRC Reference / Letter Type",ph:"e.g. SA302 query, penalty notice..."},{id:"issue",label:"What HMRC Are Saying",ph:"Describe the issue or paste key details..."},{id:"position",label:"Your Position",ph:"e.g. I have paid all CIS, my records show..."}],prompt:(f,t,p)=>`Write a professional HMRC response for a self-employed ${t}.\nFrom: ${p.name||"[Name]"}, ${p.company||"[Company]"}, UTR: ${p.utr||"[UTR]"}\nHMRC Issue: ${f.reference} — ${f.issue}\nPosition: ${f.position}\nProfessional, factual, respectful. Reference legislation where appropriate. Date and signature block.`},
  reference:{title:"Reference Letter",sub:"Request or generate a professional reference",fields:[{id:"type",label:"Reference Type",ph:"e.g. Request to contractor / Generate own reference"},{id:"recipient",label:"Who It's Going To",ph:"e.g. New main contractor, mortgage lender"},{id:"period",label:"Period Worked",ph:"e.g. January 2024 to April 2026"},{id:"works",label:"Works Carried Out",ph:"e.g. Ductwork installation on commercial projects"},{id:"quality",label:"Quality / Notes",ph:"e.g. Always professional, good timekeeping"}],prompt:(f,t,p)=>`Write a professional reference letter for a ${t} subcontractor.\nFor: ${p.name||"[Name]"}, ${p.company||"[Company]"}\nTo: ${f.recipient}, Period: ${f.period}, Works: ${f.works}, Notes: ${f.quality}\nProfessional format. Confirm reliability, quality, commercial awareness. Signature block.`},
  pricequote:{title:"Price Work Quote",sub:"Accurate scoped quote with exclusions and margin",fields:[{id:"client",label:"Client / Main Contractor",ph:"e.g. Kier Construction"},{id:"project",label:"Project",ph:"e.g. New build warehouse"},{id:"scope",label:"Exact Scope of Works",ph:"Be very specific..."},{id:"exclusions",label:"Exclusions",ph:"List everything NOT included..."},{id:"assumptions",label:"Assumptions",ph:"e.g. Free access, materials by others..."},{id:"price",label:"Your Price (£)",ph:"e.g. 24,500"}],prompt:(f,t,p)=>`Write a professional price work quotation for a ${t} subcontractor.\nFrom: ${p.name||"[Name]"}, ${p.company||"[Company]"}\nClient: ${f.client}, Project: ${f.project}\nScope: ${f.scope}, Exclusions: ${f.exclusions}, Assumptions: ${f.assumptions}, Price: £${f.price}\nInclude: clear scope, numbered exclusions, variation clause for out-of-scope works, 30-day validity, payment terms, sign-off.`},
  rateincrease:{title:"Rate Increase Letter",sub:"Professionally inform clients your rates are going up",fields:[{id:"client",label:"Client / Company Name",ph:"e.g. ABC Construction Ltd"},{id:"currentRate",label:"Current Rate (£)",ph:"e.g. 220/day or £28/hour"},{id:"newRate",label:"New Rate (£)",ph:"e.g. 245/day or £32/hour"},{id:"effectiveDate",label:"Effective From Date",ph:"e.g. 1 June 2026"},{id:"reason",label:"Reason (optional)",ph:"e.g. Rising costs, market rates..."}],prompt:(f,t,p)=>`Write a professional rate increase letter from a ${t} subcontractor.\nFrom: ${p.name||"[Name]"}, ${p.company||"[Company]"}\nTo: ${f.client||"[Client]"}\nCurrent rate: ${f.currentRate}, New rate: ${f.newRate}, Effective: ${f.effectiveDate}\nReason: ${f.reason||"General cost increases and market rates"}\nProfessional and warm. Acknowledge the working relationship, give adequate notice, be confident. Thank them for continued work. Date and signature block.`},
};

// ── PDF Generator ─────────────────────────────────────────────────────────────
function generatePDF(title, content, profile, logoSrc) {
  const w = window.open("", "_blank");
  if (!w) return;
  const now = new Date().toLocaleDateString("en-GB", {day:"numeric",month:"long",year:"numeric"});
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'DM Sans',Arial,sans-serif;font-size:12px;color:#1a1a1a;background:#fff;padding:0}
    .page{max-width:800px;margin:0 auto;padding:40px}
    .letterhead{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;border-bottom:3px solid #E8A020;margin-bottom:28px}
    .lh-left{}
    .company-name{font-size:22px;font-weight:700;color:#0d0d0d;letter-spacing:1px}
    .company-details{font-size:11px;color:#666;margin-top:6px;line-height:1.6}
    .lh-right{text-align:right}
    .logo-img{width:70px;height:70px;object-fit:contain;border-radius:6px}
    .doc-title{font-size:18px;font-weight:700;color:#0d0d0d;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px}
    .doc-date{font-size:11px;color:#888}
    .content{font-size:12px;line-height:1.8;color:#222;white-space:pre-wrap;margin-top:20px}
    .footer{margin-top:40px;padding-top:16px;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:10px;color:#aaa}
    .morris-credit{font-size:10px;color:#E8A020}
    @media print{body{padding:0}.page{padding:20px}}
  </style></head><body>
  <div class="page">
    <div class="letterhead">
      <div class="lh-left">
        <div class="company-name">${profile.company||"Your Company"}</div>
        <div class="company-details">
          ${profile.name||""}${profile.name&&"<br/>"}
          ${profile.phone||""}${profile.phone&&" · "}${profile.email||""}<br/>
          ${profile.utr?"UTR: "+profile.utr:""}${profile.utr&&profile.cis?" · ":""}${profile.cis?"CIS: "+profile.cis:""}
        </div>
      </div>
      <div class="lh-right">
        ${logoSrc?`<img src="${logoSrc}" class="logo-img" alt="Logo"/>`:""}
      </div>
    </div>
    <div class="doc-title">${title}</div>
    <div class="doc-date">Generated: ${now}</div>
    <div class="content">${content.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</div>
    <div class="footer">
      <span>${profile.company||"Morris"} · ${now}</span>
      <span class="morris-credit">Generated by Morris</span>
    </div>
  </div>
  <script>setTimeout(()=>{window.print();},400)<\/script>
  </body></html>`);
  w.document.close();
}

// ── API Call Helper ───────────────────────────────────────────────────────────
async function callMorris(prompt) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{"Content-Type":"application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01"},
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000, messages:[{role:"user",content:prompt}] })
  });
  const d = await res.json();
  return d.content?.map(b=>b.text||"").join("") || "No output.";
}

// ── Output Actions Bar ────────────────────────────────────────────────────────
function OutputActions({ title, output, profile, logo, onSave }) {
  const [copied,setCopied]=useState(false);
  const [saved,setSaved]=useState(false);
  const copy=()=>{navigator.clipboard.writeText(output);setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const save=()=>{onSave(title,output);setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const pdf=()=>generatePDF(title,output,profile,logo);
  const whatsapp=()=>window.open(`https://wa.me/?text=${encodeURIComponent(title+"\n\n"+output)}`,"_blank");
  const email=()=>window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(output)}`);
  return (
    <div className="out-actions">
      <button className="save-btn" onClick={save}>{saved?"Saved ✓":"Save"}</button>
      <button className="copy-btn" onClick={copy}>{copied?"Copied ✓":"Copy"}</button>
      <button className="pdf-btn" onClick={pdf}>📄 PDF</button>
      <button className="email-btn" onClick={email}>✉ Email</button>
      <button className="wa-btn" onClick={whatsapp}>WhatsApp</button>
    </div>
  );
}

// ── Shared Doc Tool ───────────────────────────────────────────────────────────
function DocTool({ toolId, trade, profile, logo, onSave }) {
  const cfg = toolConfigs[toolId];
  const [fields,setFields]=useState({});
  const [output,setOutput]=useState(""); const [loading,setLoading]=useState(false);
  const generate=async()=>{setLoading(true);setOutput("");try{setOutput(await callMorris(cfg.prompt(fields,trade,profile)));}catch{setOutput("Error — try again.");}setLoading(false);};
  return (
    <div>
      <div className="tool-title">{cfg.title}</div>
      <div className="tool-sub">{cfg.sub} — tailored for <span>{trade}</span></div>
      <div className="card">
        {cfg.fields.map(f=>(<div key={f.id}><div className="fl">{f.label}</div><input className="fi" placeholder={f.ph} value={fields[f.id]||""} onChange={e=>setFields({...fields,[f.id]:e.target.value})}/></div>))}
        <button className="btn" onClick={generate} disabled={loading}>{loading?"WRITING...":`GENERATE ${cfg.title.toUpperCase()}`}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Writing your document...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Document Ready</span><OutputActions title={cfg.title} output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── Verbal Instruction Recorder ───────────────────────────────────────────────
function VerbalRecorder({ trade, profile, logo, onSave }) {
  const [recording,setRecording]=useState(false);
  const [transcript,setTranscript]=useState("");
  const [formalDoc,setFormalDoc]=useState("");
  const [loading,setLoading]=useState(false);
  const [status,setStatus]=useState("Press the button to start recording a verbal instruction");
  const recognitionRef=useRef(null);
  const [saved,setSaved]=useState(false);
  const [copied,setCopied]=useState(false);

  const startRecording=()=>{
    if(!("webkitSpeechRecognition" in window||"SpeechRecognition" in window)){
      setStatus("Speech recognition not supported in this browser. Try Chrome.");
      return;
    }
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    const r=new SR();
    r.continuous=true; r.interimResults=true; r.lang="en-GB";
    r.onresult=(e)=>{
      let t="";
      for(let i=0;i<e.results.length;i++) t+=e.results[i][0].transcript+" ";
      setTranscript(t.trim());
    };
    r.onerror=()=>setStatus("Microphone error. Check browser permissions.");
    r.onend=()=>{setRecording(false);setStatus("Recording stopped. Review transcript below.");};
    recognitionRef.current=r;
    r.start();
    setRecording(true);
    setStatus("Recording... speak clearly. Press stop when done.");
  };

  const stopRecording=()=>{
    if(recognitionRef.current) recognitionRef.current.stop();
    setRecording(false);
  };

  const formalise=async()=>{
    if(!transcript.trim()) return;
    setLoading(true); setFormalDoc("");
    const p=`A ${trade} subcontractor has just recorded the following verbal instruction received on site. Convert it into a formal written record of a verbal instruction that can be used as evidence.\n\nVerbal instruction received: "${transcript}"\n\nFrom: ${profile.name||"[Name]"}, ${profile.company||"[Company]"}\n\nFormat as: a dated formal record of verbal instruction received, including what was instructed, by whom (use placeholder [Instructing Party Name]), what works are required, the date and time, and a note that this constitutes a formal record for variation purposes. Professional and factual throughout.`;
    try{setFormalDoc(await callMorris(p));}catch{setFormalDoc("Error — try again.");}
    setLoading(false);
  };

  const copy=()=>{navigator.clipboard.writeText(formalDoc);setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const save=()=>{onSave("Verbal Instruction Record",formalDoc);setSaved(true);setTimeout(()=>setSaved(false),2000);};

  return (
    <div>
      <div className="tool-title">Verbal Instruction Recorder</div>
      <div className="tool-sub">Record what they say on site — Morris turns it into a formal written record</div>
      <div className="info-box"><strong>How it works:</strong> Press record, hold your phone near the site manager as they give the instruction, press stop. Morris creates a formal written record instantly.</div>
      <div className="card" style={{textAlign:"center"}}>
        <button className={`record-btn ${recording?"recording":"idle"}`} onClick={recording?stopRecording:startRecording}>
          {recording?"⏹":"🎙️"}
        </button>
        <div style={{marginTop:16,fontSize:12,color:recording?"#e05050":"#555"}}>{status}</div>
        {recording&&<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:12}}><div style={{width:8,height:8,borderRadius:"50%",background:"#e05050",animation:"pulse 1s infinite"}}/><span style={{fontSize:12,color:"#e05050"}}>RECORDING</span></div>}
      </div>
      {transcript&&(<div className="card">
        <div className="fl">Transcript</div>
        <div className="transcript-box">{transcript}</div>
        <div style={{marginTop:14}}>
          <button className="btn" onClick={formalise} disabled={loading}>{loading?"FORMALISING...":"CONVERT TO FORMAL RECORD"}</button>
        </div>
      </div>)}
      {loading&&<div className="loading"><div className="spin"/>Converting to formal record...</div>}
      {formalDoc&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Verbal Instruction Record</span><div className="out-actions"><button className="save-btn" onClick={save}>{saved?"Saved ✓":"Save"}</button><button className="copy-btn" onClick={copy}>{copied?"Copied ✓":"Copy"}</button><button className="pdf-btn" onClick={()=>generatePDF("Verbal Instruction Record",formalDoc,profile,logo)}>📄 PDF</button></div></div>{formalDoc}</div>)}
      <div className="warn-box" style={{marginTop:14}}><strong>Tip:</strong> Send this to the contractor by email within 24 hours of receiving the instruction. That creates a paper trail that is very difficult to dispute later.</div>
    </div>
  );
}

// ── Earnings Dashboard ────────────────────────────────────────────────────────
function EarningsDashboard() {
  const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const [entries,setEntries]=useState([
    {id:1,month:"Jan",year:2026,client:"Kier Construction",amount:4800,paid:true},
    {id:2,month:"Feb",year:2026,client:"Bowmer & Kirkland",amount:5200,paid:true},
    {id:3,month:"Mar",year:2026,client:"Kier Construction",amount:4400,paid:true},
    {id:4,month:"Apr",year:2026,client:"ABC Mechanical",amount:6100,paid:false},
  ]);
  const [form,setForm]=useState({month:"Apr",year:"2026",client:"",amount:"",paid:false});
  const [receipts,setReceipts]=useState([
    {id:1,cat:"Tools & Equipment",desc:"DeWalt drill set",amount:340,date:"15 Mar 2026"},
    {id:2,cat:"Fuel & Travel",desc:"Site travel — weekly",amount:180,date:"18 Mar 2026"},
    {id:3,cat:"PPE & Clothing",desc:"Safety boots and gloves",amount:95,date:"20 Mar 2026"},
  ]);
  const [rForm,setRForm]=useState({cat:"Tools & Equipment",desc:"",amount:""});
  const receiptRef=useRef();
  const cats=["Tools & Equipment","Fuel & Travel","PPE & Clothing","Phone & Broadband","Insurance","Training","Accountancy","Materials","Subsistence","Other"];

  const addEntry=()=>{if(!form.client||!form.amount)return;setEntries(e=>[...e,{...form,id:Date.now(),amount:parseFloat(form.amount)||0}]);setForm({month:"Apr",year:"2026",client:"",amount:"",paid:false});};
  const addReceipt=()=>{if(!form.desc||!rForm.amount)return;const date=new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});setReceipts(r=>[...r,{...rForm,id:Date.now(),amount:parseFloat(rForm.amount)||0,date}]);setRForm({cat:"Tools & Equipment",desc:"",amount:""});};

  const totalEarned=entries.filter(e=>e.paid).reduce((s,e)=>s+e.amount,0);
  const totalOutstanding=entries.filter(e=>!e.paid).reduce((s,e)=>s+e.amount,0);
  const totalExpenses=receipts.reduce((s,r)=>s+r.amount,0);
  const netIncome=totalEarned-totalExpenses;

  const monthlyData=months.map(m=>{const total=entries.filter(e=>e.month===m&&e.paid).reduce((s,e)=>s+e.amount,0);return{m,total};});
  const maxVal=Math.max(...monthlyData.map(d=>d.total),1);

  const handleReceiptScan=(files)=>{
    Array.from(files).forEach(()=>{
      const date=new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
      setReceipts(r=>[...r,{id:Date.now()+Math.random(),cat:"Other",desc:"Scanned receipt — add details",amount:0,date}]);
    });
  };

  return (
    <div>
      <div className="tool-title">Earnings Dashboard</div>
      <div className="tool-sub">Track income, expenses and what you're actually taking home</div>
      <div className="dashboard-grid">
        <div className="dash-card"><div className="dash-num" style={{color:"#4caf50"}}>£{totalEarned.toLocaleString()}</div><div className="dash-label">Total Earned (Paid)</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:"#e8a020"}}>£{totalOutstanding.toLocaleString()}</div><div className="dash-label">Outstanding</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:"#e05050"}}>£{totalExpenses.toLocaleString()}</div><div className="dash-label">Total Expenses</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:netIncome>=0?"#4caf50":"#e05050"}}>£{netIncome.toLocaleString()}</div><div className="dash-label">Net Income</div></div>
      </div>

      <div className="card">
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:12,letterSpacing:1}}>MONTHLY EARNINGS</div>
        <div className="bar-chart">
          {monthlyData.map(d=>(<div key={d.m} className="bar-wrap">
            <div className="bar-val">{d.total>0?`£${(d.total/1000).toFixed(1)}k`:""}</div>
            <div className="bar" style={{height:`${d.total>0?(d.total/maxVal)*100:2}%`}}/>
            <div className="bar-label">{d.m}</div>
          </div>))}
        </div>
      </div>

      <div className="card">
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:12,letterSpacing:1}}>LOG INCOME</div>
        <div className="row2">
          <div><div className="fl">Month</div><select className="fi" value={form.month} onChange={e=>setForm({...form,month:e.target.value})} style={{cursor:"pointer"}}>{months.map(m=><option key={m}>{m}</option>)}</select></div>
          <div><div className="fl">Client</div><input className="fi" placeholder="e.g. Kier Construction" value={form.client} onChange={e=>setForm({...form,client:e.target.value})}/></div>
        </div>
        <div className="row2">
          <div><div className="fl">Amount (£)</div><input className="fi" placeholder="e.g. 4800" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></div>
          <div style={{display:"flex",alignItems:"center",gap:10,paddingTop:20}}><input type="checkbox" checked={form.paid} onChange={e=>setForm({...form,paid:e.target.checked})} style={{width:16,height:16,cursor:"pointer"}}/><span style={{fontSize:13,color:"#aaa"}}>Paid</span></div>
        </div>
        <button className="btn-sm" onClick={addEntry} style={{width:"100%",padding:"10px",fontSize:13}}>+ ADD INCOME</button>
      </div>

      <div className="card">
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:12,letterSpacing:1}}>RECEIPT SCANNER</div>
        <div className="upload-zone" onClick={()=>receiptRef.current.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleReceiptScan(e.dataTransfer.files);}}>
          <span style={{fontSize:24}}>🧾</span>
          <p>Tap to scan a receipt — photograph it and log it instantly</p>
        </div>
        <input ref={receiptRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>handleReceiptScan(e.target.files)}/>
        <div className="row2">
          <div><div className="fl">Category</div><select className="fi" value={rForm.cat} onChange={e=>setRForm({...rForm,cat:e.target.value})} style={{cursor:"pointer"}}>{cats.map(c=><option key={c}>{c}</option>)}</select></div>
          <div><div className="fl">Amount (£)</div><input className="fi" placeholder="e.g. 340" value={rForm.amount} onChange={e=>setRForm({...rForm,amount:e.target.value})}/></div>
        </div>
        <div className="fl">Description</div><input className="fi" placeholder="e.g. DeWalt drill purchase" value={rForm.desc} onChange={e=>setRForm({...rForm,desc:e.target.value})}/>
        <button className="btn-sm" onClick={addReceipt} style={{width:"100%",padding:"10px",fontSize:13}}>+ LOG EXPENSE</button>
      </div>

      {receipts.length>0&&(<div className="card">
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:12,letterSpacing:1}}>EXPENSES — {receipts.length} items · £{totalExpenses.toLocaleString()} total</div>
        {receipts.map(r=>(<div key={r.id} className="expense-row">
          <span className="expense-cat">{r.cat}</span>
          <span className="expense-desc">{r.desc}</span>
          <span style={{fontSize:10,color:"#444",marginRight:8}}>{r.date}</span>
          <span className="expense-amt">£{r.amount.toLocaleString()}</span>
          <button className="btn-danger" onClick={()=>setReceipts(x=>x.filter(q=>q.id!==r.id))}>✕</button>
        </div>))}
      </div>)}
    </div>
  );
}

// ── CIS Calculator ────────────────────────────────────────────────────────────
function CISCalc() {
  const [gross,setGross]=useState(""); const [rate,setRate]=useState("20");
  const [expenses,setExpenses]=useState(""); const [debt,setDebt]=useState("");
  const g=parseFloat(gross)||0,r=parseFloat(rate)/100,exp=parseFloat(expenses)||0,d=parseFloat(debt)||0;
  const deduction=(g-exp)*r,net=g-deduction,taxOwed=g*0.2,refund=deduction-taxOwed,actual=refund-d;
  const fmt=n=>n.toLocaleString("en-GB",{maximumFractionDigits:2});
  return (
    <div>
      <div className="tool-title">CIS Calculator</div>
      <div className="tool-sub">Work out deductions, refunds and what HMRC owes you</div>
      <div className="card">
        <div className="fl">Gross Earnings (£)</div><input className="fi" placeholder="e.g. 35000" value={gross} onChange={e=>setGross(e.target.value)}/>
        <div className="fl">CIS Deduction Rate</div>
        <select className="fi" value={rate} onChange={e=>setRate(e.target.value)} style={{cursor:"pointer"}}>
          <option value="20">20% — Standard</option><option value="30">30% — Higher (unverified)</option><option value="0">0% — Gross payment status</option>
        </select>
        <div className="fl">Allowable Expenses (£)</div><input className="fi" placeholder="e.g. 4200" value={expenses} onChange={e=>setExpenses(e.target.value)}/>
        <div className="fl">Outstanding HMRC Debt (£) — optional</div><input className="fi" placeholder="e.g. 800" value={debt} onChange={e=>setDebt(e.target.value)}/>
      </div>
      {gross&&(<div className="cis-result">
        <div className="cis-row"><span className="cis-label">Gross Earnings</span><span>£{fmt(g)}</span></div>
        <div className="cis-row"><span className="cis-label">Allowable Expenses</span><span>£{fmt(exp)}</span></div>
        <div className="cis-row"><span className="cis-label">CIS Deducted ({rate}%)</span><span>£{fmt(deduction)}</span></div>
        <div className="cis-row"><span className="cis-label">Net Pay Received</span><span>£{fmt(net)}</span></div>
        <div className="divider"/>
        <div className="cis-row"><span className="cis-label">Est. Tax Owed</span><span>£{fmt(taxOwed)}</span></div>
        <div className="cis-row"><span className="cis-label">Est. Refund</span><span style={{color:refund>0?"#4caf50":"#e05050"}}>£{fmt(refund)}</span></div>
        {d>0&&<div className="cis-row"><span className="cis-label">After Debt Offset</span><span style={{color:actual>0?"#4caf50":"#e05050"}}>£{fmt(actual)}</span></div>}
        <div className="cis-row"><span>Result</span><span style={{color:actual>0?"#4caf50":"#e05050"}}>£{fmt(actual)} {actual>0?"← REFUND":"← YOU OWE"}</span></div>
      </div>)}
      <div className="info-box" style={{marginTop:14}}><strong>Note:</strong> Estimate only. Verify with accountant before Self Assessment submission.</div>
    </div>
  );
}

// ── Self Assessment Prep ──────────────────────────────────────────────────────
function SelfAssess() {
  const [income,setIncome]=useState(""); const [expenses,setExpenses]=useState([]);
  const [mileage,setMileage]=useState(""); const [form,setForm]=useState({cat:"Tools & Equipment",desc:"",amt:""});
  const cats=["Tools & Equipment","Fuel & Travel","PPE & Clothing","Phone & Broadband","Insurance","Training","Accountancy","Materials","Subsistence","Other"];
  const addExp=()=>{if(!form.desc||!form.amt)return;setExpenses(e=>[...e,{...form,id:Date.now()}]);setForm({cat:"Tools & Equipment",desc:"",amt:""});};
  const totalExp=expenses.reduce((s,e)=>s+parseFloat(e.amt)||0,0);
  const mileageAllowance=(parseFloat(mileage)||0)*0.45;
  const taxableIncome=(parseFloat(income)||0)-totalExp-mileageAllowance;
  const fmt=n=>n.toLocaleString("en-GB",{maximumFractionDigits:2});
  return (
    <div>
      <div className="tool-title">Self Assessment Prep</div>
      <div className="tool-sub">Track expenses and mileage — organised before tax time</div>
      <div className="card">
        <div className="fl">Annual Gross Income (£)</div><input className="fi" placeholder="e.g. 42000" value={income} onChange={e=>setIncome(e.target.value)}/>
        <div className="fl">Business Mileage (miles)</div><input className="fi" placeholder="e.g. 8500" value={mileage} onChange={e=>setMileage(e.target.value)}/>
        <div className="fl">Category</div><select className="fi" value={form.cat} onChange={e=>setForm({...form,cat:e.target.value})} style={{cursor:"pointer"}}>{cats.map(c=><option key={c}>{c}</option>)}</select>
        <div className="row2">
          <div><div className="fl">Description</div><input className="fi" placeholder="e.g. DeWalt drill" value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})}/></div>
          <div><div className="fl">Amount (£)</div><input className="fi" placeholder="e.g. 340" value={form.amt} onChange={e=>setForm({...form,amt:e.target.value})}/></div>
        </div>
        <button className="btn-sm" onClick={addExp} style={{width:"100%",padding:"10px",fontSize:13}}>+ ADD EXPENSE</button>
      </div>
      {income&&(<div className="cis-result">
        <div className="cis-row"><span className="cis-label">Gross Income</span><span>£{fmt(parseFloat(income)||0)}</span></div>
        <div className="cis-row"><span className="cis-label">Total Expenses</span><span>£{fmt(totalExp)}</span></div>
        <div className="cis-row"><span className="cis-label">Mileage Allowance (45p/mile)</span><span>£{fmt(mileageAllowance)}</span></div>
        <div className="cis-row"><span>Estimated Taxable Income</span><span style={{color:"#e8a020"}}>£{fmt(taxableIncome)}</span></div>
      </div>)}
    </div>
  );
}

// ── Payment Chaser ────────────────────────────────────────────────────────────
function PaymentChaser({trade,profile,logo,onSave}) {
  const [fields,setFields]=useState({stage:"1"});
  const [output,setOutput]=useState(""); const [loading,setLoading]=useState(false);
  const stages={"1":"First Reminder (friendly)","2":"Second Reminder (firmer)","3":"Final Warning (legal threat)"};
  const generate=async()=>{
    setLoading(true);setOutput("");
    const p=`Write a payment chaser letter stage ${fields.stage} (${stages[fields.stage]}) from a ${trade} subcontractor.\nFrom: ${profile.name||"[Name]"}, ${profile.company||"[Company]"}\nTo: ${fields.client||"[Client]"}, Invoice: ${fields.invoice||"[Ref]"}, Amount: £${fields.amount||"[Amt]"}, Days overdue: ${fields.days||"[Days]"}\n${fields.stage==="3"?"Include Construction Act suspension right, adjudication warning, 7-day final deadline.":fields.stage==="2"?"Firmer tone, reference prior reminder, 14-day deadline.":"Polite but clear, 7-day deadline."}\nProfessional letter with date and signature block.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Error — try again.");}setLoading(false);
  };
  return (
    <div>
      <div className="tool-title">Payment Chaser</div>
      <div className="tool-sub">Escalating letters to get your money — fast</div>
      <div className="card">
        <div className="fl">Chaser Stage</div>
        <select className="fi" value={fields.stage} onChange={e=>setFields({...fields,stage:e.target.value})} style={{cursor:"pointer"}}>{Object.entries(stages).map(([k,v])=><option key={k} value={k}>{k}. {v}</option>)}</select>
        <div className="fl">Client / Company</div><input className="fi" placeholder="e.g. ABC Construction Ltd" value={fields.client||""} onChange={e=>setFields({...fields,client:e.target.value})}/>
        <div className="row2">
          <div><div className="fl">Invoice Ref</div><input className="fi" placeholder="e.g. INV-0042" value={fields.invoice||""} onChange={e=>setFields({...fields,invoice:e.target.value})}/></div>
          <div><div className="fl">Amount (£)</div><input className="fi" placeholder="e.g. 2,800" value={fields.amount||""} onChange={e=>setFields({...fields,amount:e.target.value})}/></div>
        </div>
        <div className="fl">Days Overdue</div><input className="fi" placeholder="e.g. 45" value={fields.days||""} onChange={e=>setFields({...fields,days:e.target.value})}/>
        <button className="btn" onClick={generate} disabled={loading}>{loading?"GENERATING...":"GENERATE CHASER"}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Writing your chaser...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Stage {fields.stage} Chaser</span><OutputActions title="Payment Chaser" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── Photo Log ─────────────────────────────────────────────────────────────────
function PhotoLog() {
  const [photos,setPhotos]=useState([]); const [caption,setCaption]=useState(""); const [project,setProject]=useState(""); const fileRef=useRef();
  const handleFiles=(files)=>{Array.from(files).forEach(file=>{const r=new FileReader();r.onload=e=>{const now=new Date();setPhotos(p=>[...p,{src:e.target.result,caption:caption||"No caption",project:project||"No project",time:now.toLocaleString("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}),id:Date.now()+Math.random()}]);};r.readAsDataURL(file);});setCaption("");};
  return (
    <div>
      <div className="tool-title">Photo Evidence Log</div>
      <div className="tool-sub">Timestamped site photos — your visual paper trail</div>
      <div className="card">
        <div className="row2">
          <div><div className="fl">Project / Site</div><input className="fi" placeholder="e.g. Salford Royal" value={project} onChange={e=>setProject(e.target.value)}/></div>
          <div><div className="fl">Caption</div><input className="fi" placeholder="e.g. Extra pipe run level 3" value={caption} onChange={e=>setCaption(e.target.value)}/></div>
        </div>
        <div className="upload-zone" onClick={()=>fileRef.current.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleFiles(e.dataTransfer.files);}}>
          <span style={{fontSize:28}}>📸</span><p>Tap to upload or drag and drop · Multiple files supported</p>
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>handleFiles(e.target.files)}/>
      </div>
      {photos.length===0&&<div className="hist-empty">No photos logged yet.</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12,marginTop:8}}>
        {photos.map(p=>(<div key={p.id} style={{background:"#141414",border:"1px solid #1e1e1e",borderRadius:8,overflow:"hidden",position:"relative"}}><img src={p.src} alt={p.caption} style={{width:"100%",height:110,objectFit:"cover",display:"block"}}/><button style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,.7)",border:"none",borderRadius:3,color:"#e05050",fontSize:12,cursor:"pointer",padding:"2px 6px"}} onClick={()=>setPhotos(x=>x.filter(q=>q.id!==p.id))}>✕</button><div style={{padding:"8px 10px"}}><div style={{fontSize:11,color:"#aaa",marginBottom:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.caption}</div><div style={{fontSize:10,color:"#444"}}>{p.project} · {p.time}</div></div></div>))}
      </div>
    </div>
  );
}

// ── Contract Review ───────────────────────────────────────────────────────────
function ContractReview({trade,profile,logo,onSave}) {
  const [text,setText]=useState(""); const [output,setOutput]=useState(""); const [loading,setLoading]=useState(false);
  const review=async()=>{if(!text.trim())return;setLoading(true);setOutput("");try{setOutput(await callMorris(`Construction contract expert reviewing a subcontract for a ${trade} sole trader in the UK.\n1) Flag unfair/dangerous clauses 2) Check payment terms vs Construction Act 3) Flag retention over 5% 4) Flag clauses removing variation rights 5) Flag unlimited liability 6) Overall risk rating: LOW/MEDIUM/HIGH 7) Plain English summary.\nContract: ${text}\nSpecific and practical. Clear headings. Write for a tradesperson.`));}catch{setOutput("Error — try again.");}setLoading(false);};
  return (
    <div>
      <div className="tool-title">Contract Review</div>
      <div className="tool-sub">Paste your subcontract — Morris flags the dodgy clauses</div>
      <div className="warn-box"><strong>Important:</strong> Guidance only. For high-value contracts get a solicitor to review.</div>
      <div className="card">
        <div className="fl">Paste Contract Text</div>
        <textarea className="fi" style={{minHeight:160}} placeholder="Paste the subcontract or specific clauses here..." value={text} onChange={e=>setText(e.target.value)}/>
        <button className="btn" onClick={review} disabled={loading||!text.trim()}>{loading?"REVIEWING...":"REVIEW CONTRACT"}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Analysing your contract...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Contract Review</span><OutputActions title="Contract Review" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── Dispute Timeline ──────────────────────────────────────────────────────────
function DisputeTimeline({profile,logo,onSave}) {
  const [events,setEvents]=useState([]); const [form,setForm]=useState({date:"",description:"",type:"instruction"}); const [summary,setSummary]=useState(""); const [loading,setLoading]=useState(false);
  const types=["instruction","delay","payment","variation","complaint","site visit","other"];
  const addEvent=()=>{if(!form.date||!form.description)return;setEvents(e=>[...e,{...form,id:Date.now()}].sort((a,b)=>new Date(a.date)-new Date(b.date)));setForm({date:"",description:"",type:"instruction"});};
  const buildSummary=async()=>{if(!events.length)return;setLoading(true);setSummary("");const timeline=events.map(e=>`${e.date} [${e.type.toUpperCase()}]: ${e.description}`).join("\n");try{setSummary(await callMorris(`Construction dispute expert. Write a formal chronological dispute summary for adjudication based on:\n${timeline}\nInclude: overview, key events in order, analysis of where things went wrong, aggrieved party position.`));}catch{setSummary("Error — try again.");}setLoading(false);};
  return (
    <div>
      <div className="tool-title">Dispute Timeline</div>
      <div className="tool-sub">Build your chronological record — generate a dispute summary</div>
      <div className="card">
        <div className="row2">
          <div><div className="fl">Date</div><input className="fi" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div>
          <div><div className="fl">Type</div><select className="fi" value={form.type} onChange={e=>setForm({...form,type:e.target.value})} style={{cursor:"pointer"}}>{types.map(t=><option key={t}>{t}</option>)}</select></div>
        </div>
        <div className="fl">Description</div>
        <textarea className="fi" style={{minHeight:60}} placeholder="e.g. Site manager verbally instructed additional ductwork on level 4..." value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
        <button className="btn-sm" onClick={addEvent} style={{width:"100%",padding:"10px",fontSize:13}}>+ ADD EVENT</button>
      </div>
      {events.length>0&&(<><div style={{marginBottom:16}}>{events.map((e,i)=>(<div key={e.id} style={{display:"flex",gap:14,marginBottom:16,position:"relative"}}>{i<events.length-1&&<div style={{position:"absolute",left:5,top:16,bottom:-16,width:2,background:"#1e1e1e"}}/>}<div style={{width:12,height:12,borderRadius:"50%",background:"#e8a020",flexShrink:0,marginTop:4,zIndex:1}}/><div style={{flex:1,background:"#141414",border:"1px solid #1e1e1e",borderRadius:8,padding:"12px 14px"}}><div style={{fontSize:10,color:"#e8a020",letterSpacing:1,marginBottom:3}}>{e.date}</div><div style={{fontSize:13,color:"#ccc",marginBottom:6}}>{e.description}</div><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:10,color:"#555"}}>{e.type}</span><button className="btn-danger" onClick={()=>setEvents(x=>x.filter(q=>q.id!==e.id))}>Remove</button></div></div></div>))}</div><button className="btn" onClick={buildSummary} disabled={loading}>{loading?"GENERATING...":"GENERATE DISPUTE SUMMARY"}</button></>)}
      {events.length===0&&<div className="hist-empty">No events added yet.</div>}
      {loading&&<div className="loading"><div className="spin"/>Building dispute summary...</div>}
      {summary&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Dispute Summary</span><OutputActions title="Dispute Summary" output={summary} profile={profile} logo={logo} onSave={onSave}/></div>{summary}</div>)}
    </div>
  );
}

// ── Incident Report ───────────────────────────────────────────────────────────
function IncidentReport({trade,profile,logo,onSave}) {
  const [fields,setFields]=useState({type:"damage"});
  const [output,setOutput]=useState(""); const [loading,setLoading]=useState(false);
  const types=["damage","theft","injury","near miss","third party damage","other"];
  const generate=async()=>{
    setLoading(true);setOutput("");
    const p=`Write a professional incident report for a ${trade} subcontractor for insurance and legal purposes.\nFrom: ${profile.name||"[Name]"}, ${profile.company||"[Company]"}\nType: ${fields.type}, Date/Time: ${fields.datetime||"[Date/Time]"}, Location: ${fields.location||"[Location]"}\nDescription: ${fields.description||"[Description]"}, Witnesses: ${fields.witnesses||"None"}, Value/Impact: ${fields.value||"TBC"}, Reported: ${fields.reported||"Yes"}\nFormal incident report with: reference number, all key fields, witness section, photos note, immediate actions, next steps, signature block.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Error — try again.");}setLoading(false);
  };
  return (
    <div>
      <div className="tool-title">Incident Report</div>
      <div className="tool-sub">Professional incident records for insurance and legal protection</div>
      <div className="warn-box"><strong>Important:</strong> Complete as soon as possible while details are fresh.</div>
      <div className="card">
        <div className="row2">
          <div><div className="fl">Incident Type</div><select className="fi" value={fields.type} onChange={e=>setFields({...fields,type:e.target.value})} style={{cursor:"pointer"}}>{types.map(t=><option key={t}>{t}</option>)}</select></div>
          <div><div className="fl">Date & Time</div><input className="fi" type="datetime-local" value={fields.datetime||""} onChange={e=>setFields({...fields,datetime:e.target.value})}/></div>
        </div>
        <div className="fl">Location on Site</div><input className="fi" placeholder="e.g. Level 3, north stairwell" value={fields.location||""} onChange={e=>setFields({...fields,location:e.target.value})}/>
        <div className="fl">What Happened</div>
        <textarea className="fi" style={{minHeight:100}} placeholder="Describe exactly what happened..." value={fields.description||""} onChange={e=>setFields({...fields,description:e.target.value})}/>
        <div className="row2">
          <div><div className="fl">Witnesses</div><input className="fi" placeholder="e.g. John Smith — ABC Plumbing" value={fields.witnesses||""} onChange={e=>setFields({...fields,witnesses:e.target.value})}/></div>
          <div><div className="fl">Estimated Value / Impact</div><input className="fi" placeholder="e.g. £2,400 stolen tools" value={fields.value||""} onChange={e=>setFields({...fields,value:e.target.value})}/></div>
        </div>
        <div className="fl">Reported to Site Management?</div>
        <select className="fi" value={fields.reported||"Yes"} onChange={e=>setFields({...fields,reported:e.target.value})} style={{cursor:"pointer"}}><option>Yes</option><option>No</option><option>Not yet</option></select>
        <button className="btn" onClick={generate} disabled={loading}>{loading?"GENERATING...":"GENERATE INCIDENT REPORT"}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Writing your incident report...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Incident Report</span><OutputActions title="Incident Report" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── Reminders ─────────────────────────────────────────────────────────────────
function Reminders() {
  const [reminders,setReminders]=useState([{id:1,title:"Chase INV-001 — ABC Construction",due:"2026-04-25",done:false,type:"payment"},{id:2,title:"Self Assessment deadline",due:"2027-01-31",done:false,type:"tax"}]);
  const [form,setForm]=useState({title:"",due:"",type:"payment"});
  const types=["payment","tax","rams","document","site","insurance","other"];
  const add=()=>{if(!form.title)return;setReminders(r=>[...r,{...form,id:Date.now(),done:false}]);setForm({title:"",due:"",type:"payment"});};
  const toggle=(id)=>setReminders(r=>r.map(x=>x.id===id?{...x,done:!x.done}:x));
  const del=(id)=>setReminders(r=>r.filter(x=>x.id!==id));
  const isOverdue=(due)=>due&&new Date(due)<new Date();
  const pending=reminders.filter(r=>!r.done); const done=reminders.filter(r=>r.done);
  return (
    <div>
      <div className="tool-title">Reminders</div>
      <div className="tool-sub">Invoice chasers, tax deadlines, RAMS renewals</div>
      <div className="card">
        <div className="fl">Reminder</div><input className="fi" placeholder="e.g. Chase payment from Kier — INV-042" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
        <div className="row2">
          <div><div className="fl">Due Date</div><input className="fi" type="date" value={form.due} onChange={e=>setForm({...form,due:e.target.value})}/></div>
          <div><div className="fl">Type</div><select className="fi" value={form.type} onChange={e=>setForm({...form,type:e.target.value})} style={{cursor:"pointer"}}>{types.map(t=><option key={t}>{t}</option>)}</select></div>
        </div>
        <button className="btn-sm" onClick={add} style={{width:"100%",padding:"10px",fontSize:13}}>+ ADD REMINDER</button>
      </div>
      {pending.length>0&&(<><div style={{fontSize:10,letterSpacing:2,color:"#555",textTransform:"uppercase",marginBottom:10}}>Pending — {pending.length}</div>{pending.map(r=>(<div key={r.id} style={{background:"#141414",border:"1px solid #1e1e1e",borderRadius:8,padding:"12px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:12}}><div style={{width:18,height:18,border:`2px solid ${r.done?"#e8a020":"#333"}`,borderRadius:4,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,background:r.done?"#e8a020":"transparent"}} onClick={()=>toggle(r.id)}>{r.done&&"✓"}</div><div style={{flex:1}}><div style={{fontSize:13,color:"#f0ede8",marginBottom:2}}>{r.title}</div><div style={{fontSize:11,color:isOverdue(r.due)?"#e05050":"#555"}}>{r.type}{r.due&&` · Due ${new Date(r.due).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}`}{isOverdue(r.due)&&" · OVERDUE"}</div></div><button style={{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:14}} onClick={()=>del(r.id)}>✕</button></div>))}</>)}
      {done.length>0&&(<><div style={{fontSize:10,letterSpacing:2,color:"#333",textTransform:"uppercase",margin:"16px 0 10px"}}>Completed</div>{done.map(r=>(<div key={r.id} style={{background:"#141414",border:"1px solid #1e1e1e",borderRadius:8,padding:"12px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:12,opacity:.5}}><div style={{width:18,height:18,border:"2px solid #e8a020",borderRadius:4,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,background:"#e8a020"}} onClick={()=>toggle(r.id)}>✓</div><div style={{flex:1}}><div style={{fontSize:13,color:"#555",textDecoration:"line-through"}}>{r.title}</div></div><button style={{background:"none",border:"none",color:"#333",cursor:"pointer",fontSize:14}} onClick={()=>del(r.id)}>✕</button></div>))}</>)}
    </div>
  );
}

// ── FIRMS tools (condensed) ───────────────────────────────────────────────────
function SubcoManage() {
  const [subbies,setSubbies]=useState([{id:1,name:"D. Morris Ductwork",trade:"Duct Fitter",project:"Salford Royal Ph2",status:"On Site",invoiced:4200,paid:4200},{id:2,name:"JS Electrical Ltd",trade:"Electrician",project:"Salford Royal Ph2",status:"On Site",invoiced:8500,paid:0},{id:3,name:"Smith Plumbing",trade:"Plumber",project:"Trafford Park",status:"Complete",invoiced:12000,paid:12000}]);
  const [form,setForm]=useState({name:"",trade:"",project:"",status:"On Site",invoiced:"",paid:""});
  const [show,setShow]=useState(false);
  const add=()=>{if(!form.name)return;setSubbies(s=>[...s,{...form,id:Date.now(),invoiced:parseFloat(form.invoiced)||0,paid:parseFloat(form.paid)||0}]);setForm({name:"",trade:"",project:"",status:"On Site",invoiced:"",paid:""});setShow(false);};
  const outstanding=subbies.reduce((s,x)=>s+(x.invoiced-x.paid),0);
  return(<div><div className="tool-title">Subcontractor Management</div><div className="tool-sub">Track all your subbies, projects and payments</div><div className="dashboard-grid"><div className="dash-card"><div className="dash-num">{subbies.length}</div><div className="dash-label">Subcontractors</div></div><div className="dash-card"><div className="dash-num">£{subbies.reduce((s,x)=>s+x.invoiced,0).toLocaleString()}</div><div className="dash-label">Total Invoiced</div></div><div className="dash-card"><div className="dash-num" style={{color:outstanding>0?"#e05050":"#4caf50"}}>£{outstanding.toLocaleString()}</div><div className="dash-label">Outstanding</div></div></div><div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button className="btn-sm" onClick={()=>setShow(!show)}>+ Add Subcontractor</button></div>{show&&(<div className="card"><div className="row2"><div><div className="fl">Company</div><input className="fi" placeholder="e.g. ABC Ductwork" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div><div><div className="fl">Trade</div><input className="fi" placeholder="e.g. Duct Fitter" value={form.trade} onChange={e=>setForm({...form,trade:e.target.value})}/></div></div><div className="row2"><div><div className="fl">Project</div><input className="fi" placeholder="e.g. Salford Royal" value={form.project} onChange={e=>setForm({...form,project:e.target.value})}/></div><div><div className="fl">Status</div><select className="fi" value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{cursor:"pointer"}}><option>On Site</option><option>Starting Soon</option><option>Complete</option><option>On Hold</option></select></div></div><div className="row2"><div><div className="fl">Invoiced (£)</div><input className="fi" value={form.invoiced} onChange={e=>setForm({...form,invoiced:e.target.value})}/></div><div><div className="fl">Paid (£)</div><input className="fi" value={form.paid} onChange={e=>setForm({...form,paid:e.target.value})}/></div></div><button className="btn-sm" onClick={add} style={{width:"100%",padding:"10px",fontSize:13}}>SAVE</button></div>)}<div className="table-wrap"><table><thead><tr><th>Company</th><th>Trade</th><th>Project</th><th>Status</th><th>Invoiced</th><th>Outstanding</th><th></th></tr></thead><tbody>{subbies.map(s=>(<tr key={s.id}><td style={{fontWeight:500,color:"#f0ede8"}}>{s.name}</td><td>{s.trade}</td><td>{s.project}</td><td><span className={`status-pill ${s.status==="On Site"?"status-green":s.status==="Complete"?"status-grey":"status-amber"}`}>{s.status}</span></td><td>£{s.invoiced.toLocaleString()}</td><td style={{color:(s.invoiced-s.paid)>0?"#e05050":"#4caf50"}}>£{(s.invoiced-s.paid).toLocaleString()}</td><td><button className="btn-danger" onClick={()=>setSubbies(x=>x.filter(q=>q.id!==s.id))}>✕</button></td></tr>))}</tbody></table></div></div>);
}

function VarTracker() {
  const [vars,setVars]=useState([{id:1,ref:"VO-001",project:"Salford Royal Ph2",description:"Extra ductwork level 4",value:1800,status:"Approved",date:"10 Apr 2026"},{id:2,ref:"VO-002",project:"Salford Royal Ph2",description:"Additional fire dampers",value:3400,status:"Submitted",date:"15 Apr 2026"},{id:3,ref:"VO-003",project:"Trafford Park",description:"Reroute main duct run",value:2100,status:"Disputed",date:"17 Apr 2026"}]);
  const [form,setForm]=useState({project:"",description:"",value:"",status:"Submitted"});
  const [show,setShow]=useState(false);
  const add=()=>{if(!form.description)return;setVars(v=>[...v,{...form,id:Date.now(),ref:`VO-00${vars.length+1}`,value:parseFloat(form.value)||0,date:new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}]);setForm({project:"",description:"",value:"",status:"Submitted"});setShow(false);};
  const approved=vars.filter(v=>v.status==="Approved").reduce((s,v)=>s+v.value,0);
  const pending=vars.filter(v=>v.status==="Submitted").reduce((s,v)=>s+v.value,0);
  const disputed=vars.filter(v=>v.status==="Disputed").reduce((s,v)=>s+v.value,0);
  return(<div><div className="tool-title">Variation Tracker</div><div className="tool-sub">Track every variation — never lose a claim</div><div className="dashboard-grid"><div className="dash-card"><div className="dash-num" style={{color:"#4caf50"}}>£{approved.toLocaleString()}</div><div className="dash-label">Approved</div></div><div className="dash-card"><div className="dash-num" style={{color:"#e8a020"}}>£{pending.toLocaleString()}</div><div className="dash-label">Pending</div></div><div className="dash-card"><div className="dash-num" style={{color:"#e05050"}}>£{disputed.toLocaleString()}</div><div className="dash-label">Disputed</div></div></div><div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button className="btn-sm" onClick={()=>setShow(!show)}>+ Log Variation</button></div>{show&&(<div className="card"><div className="fl">Project</div><input className="fi" placeholder="e.g. Salford Royal Phase 2" value={form.project} onChange={e=>setForm({...form,project:e.target.value})}/><div className="fl">Description</div><input className="fi" placeholder="e.g. Extra ductwork level 4" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><div className="row2"><div><div className="fl">Value (£)</div><input className="fi" value={form.value} onChange={e=>setForm({...form,value:e.target.value})}/></div><div><div className="fl">Status</div><select className="fi" value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{cursor:"pointer"}}><option>Submitted</option><option>Approved</option><option>Disputed</option><option>Rejected</option></select></div></div><button className="btn-sm" onClick={add} style={{width:"100%",padding:"10px",fontSize:13}}>SAVE</button></div>)}<div className="table-wrap"><table><thead><tr><th>Ref</th><th>Project</th><th>Description</th><th>Value</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>{vars.map(v=>(<tr key={v.id}><td style={{color:"#e8a020",fontFamily:"monospace"}}>{v.ref}</td><td>{v.project}</td><td>{v.description}</td><td>£{v.value.toLocaleString()}</td><td><span className={`status-pill ${v.status==="Approved"?"status-green":v.status==="Disputed"||v.status==="Rejected"?"status-red":"status-amber"}`}>{v.status}</span></td><td style={{color:"#555"}}>{v.date}</td><td><button className="btn-danger" onClick={()=>setVars(x=>x.filter(q=>q.id!==v.id))}>✕</button></td></tr>))}</tbody></table></div></div>);
}

function RAMSLibrary({trade,profile,logo,onSave}) {
  const [library,setLibrary]=useState([]); const [fields,setFields]=useState({}); const [output,setOutput]=useState(""); const [loading,setLoading]=useState(false);
  const generate=async()=>{setLoading(true);setOutput("");try{const result=await callMorris(`Write a comprehensive reusable RAMS template for a ${trade} firm.\nTask: ${fields.task||"General works"}, Hazards: ${fields.hazards||"Standard"}, Controls: ${fields.controls||"Standard"}\nReusable template with [PROJECT NAME], [SITE ADDRESS], [DATE] placeholders. Include: scope, hazard table with risk ratings, PPE, sequence, emergency procedures, competency requirements, sign-off page.`);setOutput(result);setLibrary(l=>[...l,{id:Date.now(),task:fields.task||"General RAMS",content:result,date:new Date().toLocaleDateString("en-GB")}]);}catch{setOutput("Error — try again.");}setLoading(false);};
  return(<div><div className="tool-title">RAMS Library</div><div className="tool-sub">Generate and store reusable RAMS templates</div><div className="card"><div className="fl">Task / Activity</div><input className="fi" placeholder="e.g. High level ductwork installation" value={fields.task||""} onChange={e=>setFields({...fields,task:e.target.value})}/><div className="fl">Main Hazards</div><input className="fi" placeholder="e.g. Working at height, manual handling..." value={fields.hazards||""} onChange={e=>setFields({...fields,hazards:e.target.value})}/><div className="fl">Control Measures</div><input className="fi" placeholder="e.g. MEWP, harness, PPE..." value={fields.controls||""} onChange={e=>setFields({...fields,controls:e.target.value})}/><button className="btn" onClick={generate} disabled={loading}>{loading?"GENERATING...":"GENERATE RAMS TEMPLATE"}</button></div>{library.length>0&&(<div style={{marginBottom:16}}>{library.map(l=>(<div key={l.id} className="hist-item"><div className="hist-top"><span className="hist-tool">{l.task}</span><span className="hist-date">{l.date}</span></div><div className="hist-preview">{l.content.slice(0,100)}...</div></div>))}</div>)}{loading&&<div className="loading"><div className="spin"/>Generating template...</div>}{output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">RAMS Template</span><OutputActions title="RAMS Template" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}</div>);
}

function ContractMgmt() {
  const [contracts,setContracts]=useState([{id:1,name:"Salford Royal Ph2",contractor:"Kier Construction",value:85000,start:"2026-03-01",completion:"2026-07-31",retention:4250,status:"Active"},{id:2,name:"Trafford Park Unit 4",contractor:"Bowmer & Kirkland",value:32000,start:"2026-04-14",completion:"2026-06-30",retention:1600,status:"Active"}]);
  const [form,setForm]=useState({name:"",contractor:"",value:"",start:"",completion:"",status:"Active"});
  const [show,setShow]=useState(false);
  const add=()=>{if(!form.name)return;setContracts(c=>[...c,{...form,id:Date.now(),value:parseFloat(form.value)||0,retention:(parseFloat(form.value)||0)*0.05}]);setForm({name:"",contractor:"",value:"",start:"",completion:"",status:"Active"});setShow(false);};
  const daysLeft=(date)=>{if(!date)return null;return Math.ceil((new Date(date)-new Date())/(1000*60*60*24));};
  return(<div><div className="tool-title">Contract Management</div><div className="tool-sub">Track all contracts, retention and key dates</div><div className="dashboard-grid"><div className="dash-card"><div className="dash-num">{contracts.length}</div><div className="dash-label">Active Contracts</div></div><div className="dash-card"><div className="dash-num">£{contracts.reduce((s,c)=>s+c.value,0).toLocaleString()}</div><div className="dash-label">Total Value</div></div><div className="dash-card"><div className="dash-num" style={{color:"#e8a020"}}>£{contracts.reduce((s,c)=>s+c.retention,0).toLocaleString()}</div><div className="dash-label">Retention Held</div></div></div><div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button className="btn-sm" onClick={()=>setShow(!show)}>+ Add Contract</button></div>{show&&(<div className="card"><div className="fl">Contract Name</div><input className="fi" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><div className="row2"><div><div className="fl">Main Contractor</div><input className="fi" value={form.contractor} onChange={e=>setForm({...form,contractor:e.target.value})}/></div><div><div className="fl">Value (£)</div><input className="fi" value={form.value} onChange={e=>setForm({...form,value:e.target.value})}/></div></div><div className="row2"><div><div className="fl">Start</div><input className="fi" type="date" value={form.start} onChange={e=>setForm({...form,start:e.target.value})}/></div><div><div className="fl">Completion</div><input className="fi" type="date" value={form.completion} onChange={e=>setForm({...form,completion:e.target.value})}/></div></div><button className="btn-sm" onClick={add} style={{width:"100%",padding:"10px",fontSize:13}}>SAVE</button></div>)}<div className="table-wrap"><table><thead><tr><th>Contract</th><th>Contractor</th><th>Value</th><th>Retention</th><th>Days Left</th><th>Status</th><th></th></tr></thead><tbody>{contracts.map(c=>{const d=daysLeft(c.completion);return(<tr key={c.id}><td style={{fontWeight:500,color:"#f0ede8"}}>{c.name}</td><td>{c.contractor}</td><td>£{c.value.toLocaleString()}</td><td style={{color:"#e8a020"}}>£{c.retention.toLocaleString()}</td><td style={{color:d&&d<30?"#e05050":d&&d<60?"#e8a020":"#4caf50"}}>{d!==null?`${d} days`:"—"}</td><td><span className={`status-pill ${c.status==="Active"?"status-green":"status-grey"}`}>{c.status}</span></td><td><button className="btn-danger" onClick={()=>setContracts(x=>x.filter(q=>q.id!==c.id))}>✕</button></td></tr>);})}</tbody></table></div><div className="info-box" style={{marginTop:16}}><strong>Tip:</strong> Retention is auto-calculated at 5%. Chase release dates — firms miss thousands by not tracking them.</div></div>);
}

function MultiDiary() {
  const [entries,setEntries]=useState([{id:1,author:"D. Morris",project:"Salford Royal Ph2",date:"18 Apr 2026",works:"Installed main duct run level 3. 4 men on site.",issues:"Delayed 2hrs — wet trades overrunning."},{id:2,author:"J. Smith",project:"Salford Royal Ph2",date:"18 Apr 2026",works:"Fan coil connections levels 1-2. 2 men on site.",issues:"None."}]);
  const [form,setForm]=useState({author:"",project:"",date:"",works:"",issues:""});
  const add=()=>{if(!form.works)return;setEntries(e=>[{...form,id:Date.now()},...e]);setForm({author:"",project:"",date:"",works:"",issues:""});};
  return(<div><div className="tool-title">Multi-user Site Diary</div><div className="tool-sub">Every person logs their day — one feed for the firm</div><div className="card"><div className="row2"><div><div className="fl">Name</div><input className="fi" placeholder="e.g. D. Morris" value={form.author} onChange={e=>setForm({...form,author:e.target.value})}/></div><div><div className="fl">Project</div><input className="fi" placeholder="e.g. Salford Royal" value={form.project} onChange={e=>setForm({...form,project:e.target.value})}/></div></div><div className="fl">Date</div><input className="fi" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/><div className="fl">Works Carried Out</div><textarea className="fi" placeholder="What did you do today?" value={form.works} onChange={e=>setForm({...form,works:e.target.value})}/><div className="fl">Issues / Delays / Instructions</div><input className="fi" placeholder="Any problems or instructions..." value={form.issues} onChange={e=>setForm({...form,issues:e.target.value})}/><button className="btn-sm" onClick={add} style={{width:"100%",padding:"10px",fontSize:13}}>+ LOG TODAY'S DIARY</button></div>{entries.map(e=>(<div key={e.id} className="hist-item"><div className="hist-top"><span className="hist-tool">{e.author} — {e.project}</span><span className="hist-date">{e.date}</span></div><div style={{fontSize:12,color:"#ccc",marginBottom:4}}>{e.works}</div>{e.issues&&e.issues!=="None."&&<div style={{fontSize:11,color:"#e8a020"}}>⚠ {e.issues}</div>}</div>))}</div>);
}

function PayTracker() {
  const [invoices,setInvoices]=useState([{id:1,ref:"INV-041",client:"Kier Construction",project:"Salford Royal Ph2",amount:8500,due:"2026-04-30",status:"Unpaid"},{id:2,ref:"INV-040",client:"Bowmer & Kirkland",project:"Trafford Park",amount:4200,due:"2026-04-15",status:"Paid"},{id:3,ref:"INV-039",client:"Kier Construction",project:"Salford Royal Ph2",amount:6800,due:"2026-03-31",status:"Overdue"}]);
  const [form,setForm]=useState({ref:"",client:"",project:"",amount:"",due:"",status:"Unpaid"});
  const [show,setShow]=useState(false);
  const add=()=>{if(!form.ref)return;setInvoices(i=>[{...form,id:Date.now(),amount:parseFloat(form.amount)||0},...i]);setForm({ref:"",client:"",project:"",amount:"",due:"",status:"Unpaid"});setShow(false);};
  const outstanding=invoices.filter(i=>i.status!=="Paid").reduce((s,i)=>s+i.amount,0);
  const overdue=invoices.filter(i=>i.status==="Overdue").reduce((s,i)=>s+i.amount,0);
  return(<div><div className="tool-title">Payment Schedule Tracker</div><div className="tool-sub">Every invoice — know exactly where your money is</div><div className="dashboard-grid"><div className="dash-card"><div className="dash-num" style={{color:"#e8a020"}}>£{outstanding.toLocaleString()}</div><div className="dash-label">Outstanding</div></div><div className="dash-card"><div className="dash-num" style={{color:"#e05050"}}>£{overdue.toLocaleString()}</div><div className="dash-label">Overdue</div></div><div className="dash-card"><div className="dash-num">{invoices.filter(i=>i.status==="Unpaid").length}</div><div className="dash-label">Awaiting Payment</div></div></div><div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button className="btn-sm" onClick={()=>setShow(!show)}>+ Add Invoice</button></div>{show&&(<div className="card"><div className="row2"><div><div className="fl">Invoice Ref</div><input className="fi" value={form.ref} onChange={e=>setForm({...form,ref:e.target.value})}/></div><div><div className="fl">Client</div><input className="fi" value={form.client} onChange={e=>setForm({...form,client:e.target.value})}/></div></div><div className="row2"><div><div className="fl">Amount (£)</div><input className="fi" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></div><div><div className="fl">Due Date</div><input className="fi" type="date" value={form.due} onChange={e=>setForm({...form,due:e.target.value})}/></div></div><div className="fl">Status</div><select className="fi" value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{cursor:"pointer"}}><option>Unpaid</option><option>Paid</option><option>Overdue</option><option>Disputed</option></select><button className="btn-sm" onClick={add} style={{width:"100%",padding:"10px",fontSize:13}}>SAVE</button></div>)}<div className="table-wrap"><table><thead><tr><th>Ref</th><th>Client</th><th>Project</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>{invoices.map(i=>(<tr key={i.id}><td style={{color:"#e8a020",fontFamily:"monospace"}}>{i.ref}</td><td>{i.client}</td><td>{i.project}</td><td>£{i.amount.toLocaleString()}</td><td style={{color:i.status==="Overdue"?"#e05050":"#555"}}>{i.due?new Date(i.due).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):"—"}</td><td><span className={`status-pill ${i.status==="Paid"?"status-green":i.status==="Overdue"||i.status==="Disputed"?"status-red":"status-amber"}`}>{i.status}</span></td><td><button className="btn-danger" onClick={()=>setInvoices(x=>x.filter(q=>q.id!==i.id))}>✕</button></td></tr>))}</tbody></table></div></div>);
}

function IncidentLogFirm() {
  const [incidents,setIncidents]=useState([{id:1,date:"17 Apr 2026",project:"Salford Royal Ph2",type:"Near Miss",description:"Unsecured load on scaffold",reported:"Yes",status:"Closed"},{id:2,date:"18 Apr 2026",project:"Trafford Park",type:"Damage",description:"Forklift clipped copper pipework",reported:"Yes",status:"Open"}]);
  const [form,setForm]=useState({date:"",project:"",type:"Near Miss",description:"",reported:"Yes",status:"Open"});
  const [show,setShow]=useState(false);
  const add=()=>{if(!form.description)return;setIncidents(i=>[{...form,id:Date.now()},...i]);setForm({date:"",project:"",type:"Near Miss",description:"",reported:"Yes",status:"Open"});setShow(false);};
  const open=incidents.filter(i=>i.status==="Open").length;
  return(<div><div className="tool-title">Incident Log</div><div className="tool-sub">Company-wide incident record — stay legally compliant</div><div className="dashboard-grid"><div className="dash-card"><div className="dash-num">{incidents.length}</div><div className="dash-label">Total Incidents</div></div><div className="dash-card"><div className="dash-num" style={{color:open>0?"#e05050":"#4caf50"}}>{open}</div><div className="dash-label">Open</div></div><div className="dash-card"><div className="dash-num">{incidents.filter(i=>i.type==="Near Miss").length}</div><div className="dash-label">Near Misses</div></div></div><div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button className="btn-sm" onClick={()=>setShow(!show)}>+ Log Incident</button></div>{show&&(<div className="card"><div className="row2"><div><div className="fl">Date</div><input className="fi" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div><div><div className="fl">Project</div><input className="fi" value={form.project} onChange={e=>setForm({...form,project:e.target.value})}/></div></div><div className="row2"><div><div className="fl">Type</div><select className="fi" value={form.type} onChange={e=>setForm({...form,type:e.target.value})} style={{cursor:"pointer"}}><option>Near Miss</option><option>Injury</option><option>Damage</option><option>Theft</option><option>Other</option></select></div><div><div className="fl">Reported</div><select className="fi" value={form.reported} onChange={e=>setForm({...form,reported:e.target.value})} style={{cursor:"pointer"}}><option>Yes</option><option>No</option></select></div></div><div className="fl">Description</div><textarea className="fi" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><button className="btn-sm" onClick={add} style={{width:"100%",padding:"10px",fontSize:13}}>LOG INCIDENT</button></div>)}<div className="table-wrap"><table><thead><tr><th>Date</th><th>Project</th><th>Type</th><th>Description</th><th>Status</th><th></th></tr></thead><tbody>{incidents.map(i=>(<tr key={i.id}><td style={{color:"#555"}}>{i.date}</td><td>{i.project}</td><td><span className={`status-pill ${i.type==="Injury"?"status-red":i.type==="Near Miss"?"status-amber":"status-grey"}`}>{i.type}</span></td><td style={{maxWidth:200}}>{i.description}</td><td><span className={`status-pill ${i.status==="Open"?"status-red":"status-grey"}`}>{i.status}</span></td><td><button className="btn-danger" onClick={()=>setIncidents(x=>x.filter(q=>q.id!==i.id))}>✕</button></td></tr>))}</tbody></table></div></div>);
}

// ── History ───────────────────────────────────────────────────────────────────
function History({history,onDelete}) {
  if(!history.length)return(<div><div className="tool-title">Document History</div><div className="tool-sub">Every document you save appears here</div><div className="hist-empty">No saved documents yet.<br/>Hit "Save" after generating any document.</div></div>);
  return(<div><div className="tool-title">Document History</div><div className="tool-sub">{history.length} saved document{history.length!==1?"s":""}</div>{[...history].reverse().map((h,i)=>(<div key={i} className="hist-item"><div className="hist-top"><span className="hist-tool">{h.tool}</span><div style={{display:"flex",gap:8,alignItems:"center"}}><span className="hist-date">{h.date}</span><button style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:13}} onClick={()=>onDelete(history.length-1-i)}>✕</button></div></div><div className="hist-preview">{h.content.slice(0,130)}...</div></div>))}</div>);
}

// ── Profile ───────────────────────────────────────────────────────────────────
function Profile({profile,setProfile,logo,setLogo}) {
  const [saved,setSaved]=useState(false);
  const logoRef=useRef();
  const handleLogo=(files)=>{if(!files[0])return;const r=new FileReader();r.onload=e=>setLogo(e.target.result);r.readAsDataURL(files[0]);};
  return(
    <div>
      <div className="tool-title">My Profile</div>
      <div className="tool-sub">Set once — auto-fills every document and letterhead</div>
      <div className="card">
        <div className="fl">Company Logo</div>
        <div className="logo-upload-zone" onClick={()=>logoRef.current.click()}>
          {logo?<img src={logo} className="logo-preview" alt="Logo"/>:<div style={{width:80,height:80,background:"#1a1a1a",border:"2px dashed #333",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>🏗️</div>}
          <div><div style={{fontSize:13,color:"#aaa",marginBottom:4}}>{logo?"Logo uploaded — click to change":"Upload your company logo"}</div><div style={{fontSize:11,color:"#555"}}>Appears on all PDF documents</div></div>
        </div>
        <input ref={logoRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleLogo(e.target.files)}/>
        <div className="row2"><div><div className="fl">Full Name</div><input className="fi" placeholder="e.g. Dexter Morris" value={profile.name} onChange={e=>setProfile({...profile,name:e.target.value})}/></div><div><div className="fl">Company Name</div><input className="fi" placeholder="e.g. Morris Ductwork Ltd" value={profile.company} onChange={e=>setProfile({...profile,company:e.target.value})}/></div></div>
        <div className="row2"><div><div className="fl">UTR Number</div><input className="fi" placeholder="e.g. 1234567890" value={profile.utr} onChange={e=>setProfile({...profile,utr:e.target.value})}/></div><div><div className="fl">CIS Reg Number</div><input className="fi" placeholder="e.g. CIS123456" value={profile.cis} onChange={e=>setProfile({...profile,cis:e.target.value})}/></div></div>
        <div className="row2"><div><div className="fl">Phone</div><input className="fi" placeholder="e.g. 07700 900000" value={profile.phone} onChange={e=>setProfile({...profile,phone:e.target.value})}/></div><div><div className="fl">Email</div><input className="fi" placeholder="e.g. you@company.co.uk" value={profile.email} onChange={e=>setProfile({...profile,email:e.target.value})}/></div></div>
        <div className="divider"/>
        <div style={{fontSize:11,color:"#e8a020",marginBottom:12,letterSpacing:1}}>BANK DETAILS — AUTO-FILLS INVOICES</div>
        <div className="fl">Account Name</div><input className="fi" placeholder="e.g. Dexter Morris" value={profile.bankName} onChange={e=>setProfile({...profile,bankName:e.target.value})}/>
        <div className="row2"><div><div className="fl">Sort Code</div><input className="fi" placeholder="e.g. 12-34-56" value={profile.sortCode} onChange={e=>setProfile({...profile,sortCode:e.target.value})}/></div><div><div className="fl">Account Number</div><input className="fi" placeholder="e.g. 12345678" value={profile.accNum} onChange={e=>setProfile({...profile,accNum:e.target.value})}/></div></div>
        <button className="btn" onClick={()=>{setSaved(true);setTimeout(()=>setSaved(false),2500);}}>SAVE PROFILE</button>
        {saved&&<div className="profile-saved">✓ Saved — all documents and PDFs will use these details</div>}
      </div>
      <div className="info-box"><strong>Privacy:</strong> Stored in this session only. Never sent to any external server.</div>
    </div>
  );
}

// ── Toolbox Talk Generator ────────────────────────────────────────────────────
function ToolboxTalk({trade,profile,logo,onSave}) {
  const [fields,setFields]=useState({});
  const [output,setOutput]=useState(""); const [loading,setLoading]=useState(false);
  const topics=["Working at Height","Manual Handling","Electrical Safety","Fire Safety","PPE Requirements","COSHH / Hazardous Substances","Housekeeping & Slips Trips Falls","Welfare & First Aid","Near Miss Reporting","Hot Weather Working","Cold Weather Working","Noise at Work","Hand Arm Vibration","Lone Working","Mental Health Awareness"];
  const generate=async()=>{
    setLoading(true);setOutput("");
    const p=`Write a professional toolbox talk briefing document for a ${trade} team on site.\nCompany: ${profile.company||"[Company]"}\nTopic: ${fields.topic||"General Safety"}\nSite: ${fields.site||"[Site Name]"}\nDate: ${fields.date||"[Date]"}\nPresented by: ${fields.presenter||profile.name||"[Name]"}\nWrite it as a structured toolbox talk including: key points to cover (5-7 bullet points), relevant legislation or standards, what to do if something goes wrong, questions to ask the team, and a sign-off attendance sheet with spaces for names and signatures. Keep language plain and practical — written for tradespeople not office workers.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Error — try again.");}setLoading(false);
  };
  return(
    <div>
      <div className="tool-title">Toolbox Talk</div>
      <div className="tool-sub">Short safety briefings — required on most commercial sites</div>
      <div className="info-box"><strong>Tip:</strong> Run toolbox talks at the start of the day or before a new task begins. Keep them under 10 minutes. Get everyone to sign the attendance sheet.</div>
      <div className="card">
        <div className="fl">Topic</div>
        <select className="fi" value={fields.topic||""} onChange={e=>setFields({...fields,topic:e.target.value})} style={{cursor:"pointer"}}>
          <option value="">Select a topic...</option>
          {topics.map(t=><option key={t}>{t}</option>)}
        </select>
        <div className="row2">
          <div><div className="fl">Site / Project</div><input className="fi" placeholder="e.g. Salford Royal Phase 2" value={fields.site||""} onChange={e=>setFields({...fields,site:e.target.value})}/></div>
          <div><div className="fl">Date</div><input className="fi" type="date" value={fields.date||""} onChange={e=>setFields({...fields,date:e.target.value})}/></div>
        </div>
        <div className="fl">Presented By</div>
        <input className="fi" placeholder={profile.name||"e.g. D. Morris"} value={fields.presenter||""} onChange={e=>setFields({...fields,presenter:e.target.value})}/>
        <button className="btn" onClick={generate} disabled={loading||!fields.topic}>{loading?"GENERATING...":"GENERATE TOOLBOX TALK"}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Writing your toolbox talk...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Toolbox Talk — {fields.topic}</span><OutputActions title={`Toolbox Talk — ${fields.topic}`} output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── Asbestos Awareness Record ─────────────────────────────────────────────────
function AsbestosRecord() {
  const [records,setRecords]=useState([
    {id:1,name:"D. Morris",company:"Morris Ductwork",date:"15 Jan 2026",type:"Awareness Briefing",site:"Salford Royal Ph2",briefedBy:"Site Manager — J. Williams",signed:true},
  ]);
  const [form,setForm]=useState({name:"",company:"",date:"",type:"Awareness Briefing",site:"",briefedBy:"",signed:false});
  const [showForm,setShowForm]=useState(false);
  const types=["Awareness Briefing","Cat A Survey Discussed","Cat B Survey Discussed","Refurbishment / Demolition Survey","Emergency Briefing"];
  const add=()=>{if(!form.name||!form.date)return;setRecords(r=>[...r,{...form,id:Date.now()}]);setForm({name:"",company:"",date:"",type:"Awareness Briefing",site:"",briefedBy:"",signed:false});setShowForm(false);};
  return(
    <div>
      <div className="tool-title">Asbestos Awareness Record</div>
      <div className="tool-sub">Log who has been briefed and when — stay legally compliant</div>
      <div className="warn-box"><strong>Legal requirement:</strong> Anyone who may disturb asbestos during their work must receive asbestos awareness training. This log is your proof of compliance.</div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
        <button className="btn-sm" onClick={()=>setShowForm(!showForm)}>+ Log Briefing</button>
      </div>
      {showForm&&(<div className="card">
        <div className="row2">
          <div><div className="fl">Name</div><input className="fi" placeholder="e.g. D. Morris" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
          <div><div className="fl">Company</div><input className="fi" placeholder="e.g. Morris Ductwork" value={form.company} onChange={e=>setForm({...form,company:e.target.value})}/></div>
        </div>
        <div className="row2">
          <div><div className="fl">Date of Briefing</div><input className="fi" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div>
          <div><div className="fl">Briefing Type</div><select className="fi" value={form.type} onChange={e=>setForm({...form,type:e.target.value})} style={{cursor:"pointer"}}>{types.map(t=><option key={t}>{t}</option>)}</select></div>
        </div>
        <div className="row2">
          <div><div className="fl">Site / Project</div><input className="fi" placeholder="e.g. Salford Royal" value={form.site} onChange={e=>setForm({...form,site:e.target.value})}/></div>
          <div><div className="fl">Briefed By</div><input className="fi" placeholder="e.g. Site Manager — J. Williams" value={form.briefedBy} onChange={e=>setForm({...form,briefedBy:e.target.value})}/></div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
          <input type="checkbox" checked={form.signed} onChange={e=>setForm({...form,signed:e.target.checked})} style={{width:16,height:16,cursor:"pointer"}}/>
          <span style={{fontSize:13,color:"#aaa"}}>Signature obtained</span>
        </div>
        <button className="btn-sm" onClick={add} style={{width:"100%",padding:"10px",fontSize:13}}>SAVE RECORD</button>
      </div>)}
      <div className="table-wrap">
        <table><thead><tr><th>Name</th><th>Company</th><th>Date</th><th>Type</th><th>Site</th><th>Signed</th><th></th></tr></thead>
        <tbody>{records.map(r=>(<tr key={r.id}>
          <td style={{fontWeight:500,color:"#f0ede8"}}>{r.name}</td>
          <td>{r.company}</td>
          <td style={{color:"#555"}}>{r.date?new Date(r.date).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}):r.date}</td>
          <td>{r.type}</td>
          <td>{r.site}</td>
          <td><span className={`status-pill ${r.signed?"status-green":"status-red"}`}>{r.signed?"✓ Yes":"✗ No"}</span></td>
          <td><button className="btn-danger" onClick={()=>setRecords(x=>x.filter(q=>q.id!==r.id))}>✕</button></td>
        </tr>))}</tbody></table>
      </div>
      <div className="info-box" style={{marginTop:16}}><strong>Reminder:</strong> Asbestos awareness briefings should be refreshed annually. Records must be kept for a minimum of 3 years.</div>
    </div>
  );
}

// ── Snagging List ─────────────────────────────────────────────────────────────
function SnaggingList({trade,profile,logo,onSave}) {
  const [snags,setSnags]=useState([]);
  const [form,setForm]=useState({location:"",description:"",priority:"Medium",responsible:"",deadline:""});
  const [projectInfo,setProjectInfo]=useState({project:"",client:"",date:""});
  const [output,setOutput]=useState(""); const [loading,setLoading]=useState(false);
  const [showForm,setShowForm]=useState(false);
  const priorities=["Low","Medium","High","Critical"];

  const add=()=>{if(!form.description)return;setSnags(s=>[...s,{...form,id:Date.now(),status:"Open",ref:`SN-${String(s.length+1).padStart(3,"0")}`}]);setForm({location:"",description:"",priority:"Medium",responsible:"",deadline:""});};
  const closeSnag=(id)=>setSnags(s=>s.map(x=>x.id===id?{...x,status:"Closed"}:x));
  const open=snags.filter(s=>s.status==="Open").length;
  const critical=snags.filter(s=>s.priority==="Critical"&&s.status==="Open").length;

  const generateFormal=async()=>{
    if(!snags.length)return;
    setLoading(true);setOutput("");
    const list=snags.map(s=>`${s.ref} [${s.priority}] ${s.location}: ${s.description} — Responsible: ${s.responsible||"TBC"} — Deadline: ${s.deadline||"TBC"} — Status: ${s.status}`).join("\n");
    const p=`Write a formal snagging list document for a ${trade} subcontractor.\nCompany: ${profile.company||"[Company]"}\nProject: ${projectInfo.project||"[Project]"}\nClient: ${projectInfo.client||"[Client]"}\nDate: ${projectInfo.date||"[Date]"}\nSnag items:\n${list}\nFormat as a professional handover snagging document with: introduction, numbered snag items table, rectification deadline, sign-off section for both parties, and note that final payment is subject to snagging completion.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Error — try again.");}setLoading(false);
  };

  return(
    <div>
      <div className="tool-title">Snagging List</div>
      <div className="tool-sub">Record defects at handover — get signed off and get paid</div>
      <div className="card">
        <div className="row2">
          <div><div className="fl">Project</div><input className="fi" placeholder="e.g. Commercial fit-out, Manchester" value={projectInfo.project} onChange={e=>setProjectInfo({...projectInfo,project:e.target.value})}/></div>
          <div><div className="fl">Client / Contractor</div><input className="fi" placeholder="e.g. ABC Construction Ltd" value={projectInfo.client} onChange={e=>setProjectInfo({...projectInfo,client:e.target.value})}/></div>
        </div>
        <div className="fl">Inspection Date</div>
        <input className="fi" type="date" value={projectInfo.date} onChange={e=>setProjectInfo({...projectInfo,date:e.target.value})}/>
      </div>

      {snags.length>0&&(<div className="dashboard-grid">
        <div className="dash-card"><div className="dash-num">{snags.length}</div><div className="dash-label">Total Snags</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:open>0?"#e8a020":"#4caf50"}}>{open}</div><div className="dash-label">Open</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:critical>0?"#e05050":"#4caf50"}}>{critical}</div><div className="dash-label">Critical</div></div>
      </div>)}

      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
        <button className="btn-sm" onClick={()=>setShowForm(!showForm)}>+ Add Snag Item</button>
      </div>

      {showForm&&(<div className="card">
        <div className="row2">
          <div><div className="fl">Location</div><input className="fi" placeholder="e.g. Level 3, north end" value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></div>
          <div><div className="fl">Priority</div><select className="fi" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})} style={{cursor:"pointer"}}>{priorities.map(p=><option key={p}>{p}</option>)}</select></div>
        </div>
        <div className="fl">Description of Defect</div>
        <textarea className="fi" style={{minHeight:60}} placeholder="e.g. Duct joint not sealed properly, air leakage visible..." value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
        <div className="row2">
          <div><div className="fl">Responsible Party</div><input className="fi" placeholder="e.g. Morris Ductwork" value={form.responsible} onChange={e=>setForm({...form,responsible:e.target.value})}/></div>
          <div><div className="fl">Rectification Deadline</div><input className="fi" type="date" value={form.deadline} onChange={e=>setForm({...form,deadline:e.target.value})}/></div>
        </div>
        <button className="btn-sm" onClick={add} style={{width:"100%",padding:"10px",fontSize:13}}>+ ADD SNAG</button>
      </div>)}

      {snags.length>0&&(<>
        <div className="table-wrap">
          <table><thead><tr><th>Ref</th><th>Location</th><th>Description</th><th>Priority</th><th>Deadline</th><th>Status</th><th></th></tr></thead>
          <tbody>{snags.map(s=>(<tr key={s.id}>
            <td style={{color:"#e8a020",fontFamily:"monospace"}}>{s.ref}</td>
            <td>{s.location}</td>
            <td>{s.description}</td>
            <td><span className={`status-pill ${s.priority==="Critical"?"status-red":s.priority==="High"?"status-amber":s.priority==="Medium"?"status-grey":"status-grey"}`}>{s.priority}</span></td>
            <td style={{color:"#555"}}>{s.deadline?new Date(s.deadline).toLocaleDateString("en-GB",{day:"numeric",month:"short"}):"-"}</td>
            <td><span className={`status-pill ${s.status==="Closed"?"status-green":"status-amber"}`}>{s.status}</span></td>
            <td style={{display:"flex",gap:6}}>
              {s.status==="Open"&&<button className="btn-green" onClick={()=>closeSnag(s.id)}>✓</button>}
              <button className="btn-danger" onClick={()=>setSnags(x=>x.filter(q=>q.id!==s.id))}>✕</button>
            </td>
          </tr>))}</tbody></table>
        </div>
        <div style={{marginTop:16}}>
          <button className="btn" onClick={generateFormal} disabled={loading}>{loading?"GENERATING...":"GENERATE FORMAL SNAGGING DOCUMENT"}</button>
        </div>
      </>)}

      {snags.length===0&&<div className="hist-empty">No snag items logged yet.<br/>Add defects above then generate a formal snagging document.</div>}
      {loading&&<div className="loading"><div className="spin"/>Writing your snagging document...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Snagging Document</span><OutputActions title="Snagging List" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── Rate Increase Letter ──────────────────────────────────────────────────────
const rateIncreaseConfig = {
  title:"Rate Increase Letter",
  sub:"Professionally inform clients your rates are going up",
  fields:[
    {id:"client",label:"Client / Company Name",ph:"e.g. ABC Construction Ltd"},
    {id:"currentRate",label:"Current Rate (£)",ph:"e.g. 220/day or £28/hour"},
    {id:"newRate",label:"New Rate (£)",ph:"e.g. 245/day or £32/hour"},
    {id:"effectiveDate",label:"Effective From Date",ph:"e.g. 1 June 2026"},
    {id:"reason",label:"Reason (optional)",ph:"e.g. Rising material costs, increased experience, market rates..."},
  ],
  prompt:(f,t,p)=>`Write a professional rate increase letter from a ${t} subcontractor to a client.\nFrom: ${p.name||"[Name]"}, ${p.company||"[Company]"}\nTo: ${f.client||"[Client]"}\nCurrent rate: ${f.currentRate||"[Current]"}, New rate: ${f.newRate||"[New]"}\nEffective from: ${f.effectiveDate||"[Date]"}\nReason: ${f.reason||"General cost increases and market rates"}\nWrite it professionally and warmly — acknowledge the working relationship, give adequate notice, be confident but not aggressive. Thank them for their continued work. Include date placeholder and signature block.`
};

// ── Apprentice Manager ────────────────────────────────────────────────────────
function ApprenticeManager({trade, profile, logo, onSave}) {
  const [tab, setTab] = useState("log");
  const [logs, setLogs] = useState([
    {id:1, week:"w/e 18 Apr 2026", hours:40, tasks:"Assisted with ductwork installation level 3. Learned how to use angle grinder safely.", skills:["Angle grinder operation","Duct joining techniques"], supervisor:"D. Morris"},
  ]);
  const [competencies, setCompetencies] = useState([
    {id:1, skill:"Safe use of hand tools", status:"Signed Off", date:"10 Mar 2026"},
    {id:2, skill:"Manual handling techniques", status:"Signed Off", date:"15 Mar 2026"},
    {id:3, skill:"Ductwork joining and sealing", status:"In Progress", date:""},
    {id:4, skill:"Working at height awareness", status:"Not Started", date:""},
    {id:5, skill:"Reading and interpreting drawings", status:"Not Started", date:""},
  ]);
  const [logForm, setLogForm] = useState({week:"", hours:"", tasks:"", skills:"", supervisor:""});
  const [compForm, setCompForm] = useState({skill:"", status:"Not Started", date:""});
  const [apprenticeInfo, setApprenticeInfo] = useState({name:"", trade:"", startDate:"", trainingProvider:"", assessorName:""});
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const [docType, setDocType] = useState("offer");

  const addLog = () => {
    if(!logForm.week || !logForm.tasks) return;
    setLogs(l => [...l, {...logForm, id:Date.now(), skills:logForm.skills.split(",").map(s=>s.trim()).filter(Boolean)}]);
    setLogForm({week:"", hours:"", tasks:"", skills:"", supervisor:""});
  };

  const signOff = (id) => {
    const today = new Date().toLocaleDateString("en-GB", {day:"numeric", month:"short", year:"numeric"});
    setCompetencies(c => c.map(x => x.id===id ? {...x, status:"Signed Off", date:today} : x));
  };

  const addComp = () => {
    if(!compForm.skill) return;
    setCompetencies(c => [...c, {...compForm, id:Date.now()}]);
    setCompForm({skill:"", status:"Not Started", date:""});
  };

  const totalHours = logs.reduce((s,l) => s + (parseFloat(l.hours)||0), 0);
  const signedOff = competencies.filter(c => c.status==="Signed Off").length;

  const generateDoc = async () => {
    setLoading(true); setOutput("");
    let prompt = "";
    if(docType === "offer") {
      prompt = `Write a professional apprenticeship offer letter from a ${trade} contractor.\nFrom: ${profile.name||"[Name]"}, ${profile.company||"[Company]"}\nApprenticeship for: ${apprenticeInfo.name||"[Apprentice Name]"}\nTrade: ${apprenticeInfo.trade||trade}\nStart date: ${apprenticeInfo.startDate||"[Start Date]"}\nTraining provider: ${apprenticeInfo.trainingProvider||"[Training Provider]"}\nInclude: role description, hours of work, pay rate placeholder, training obligations, probation period (3 months), expectations, and signature blocks for both parties.`;
    } else if(docType === "progress") {
      const compSummary = competencies.map(c => `${c.skill}: ${c.status}`).join(", ");
      prompt = `Write a professional apprentice progress review document for a ${trade} contractor.\nContractor: ${profile.company||"[Company]"}, Supervisor: ${profile.name||"[Name]"}\nApprentice: ${apprenticeInfo.name||"[Apprentice Name]"}\nTraining Provider: ${apprenticeInfo.trainingProvider||"[Provider]"}, Assessor: ${apprenticeInfo.assessorName||"[Assessor]"}\nTotal hours logged: ${totalHours}\nCompetencies: ${compSummary}\nRecent tasks: ${logs.slice(-3).map(l=>l.tasks).join("; ")}\nWrite a formal progress review covering: overall progress assessment, competencies achieved, areas for development, next steps, and sign-off section for supervisor, apprentice and assessor.`;
    } else if(docType === "warning") {
      prompt = `Write a professional formal warning letter for an apprentice from a ${trade} contractor.\nFrom: ${profile.name||"[Name]"}, ${profile.company||"[Company]"}\nApprentice: ${apprenticeInfo.name||"[Apprentice Name]"}\nInclude: nature of the concern (leave placeholder), previous verbal warnings (placeholder), expected improvement, review date (4 weeks), consequences if no improvement, and signature blocks. Professional, fair and legally appropriate tone.`;
    }
    try { setOutput(await callMorris(prompt)); } catch { setOutput("Error — try again."); }
    setLoading(false);
  };

  const tabStyle = (t) => ({
    padding:"8px 16px", cursor:"pointer", fontSize:12, borderBottom:`2px solid ${tab===t?"#e8a020":"transparent"}`,
    color:tab===t?"#e8a020":"#555", background:"none", border:"none", borderBottom:`2px solid ${tab===t?"#e8a020":"transparent"}`,
    transition:"all .2s", fontFamily:"inherit"
  });

  return (
    <div>
      <div className="tool-title">Apprentice Manager</div>
      <div className="tool-sub">Manage your apprentice — hours, competencies and documents</div>

      <div className="card">
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:12,letterSpacing:1}}>APPRENTICE DETAILS</div>
        <div className="row2">
          <div><div className="fl">Apprentice Name</div><input className="fi" placeholder="e.g. J. Smith" value={apprenticeInfo.name} onChange={e=>setApprenticeInfo({...apprenticeInfo,name:e.target.value})}/></div>
          <div><div className="fl">Trade / Programme</div><input className="fi" placeholder={`e.g. ${trade}`} value={apprenticeInfo.trade} onChange={e=>setApprenticeInfo({...apprenticeInfo,trade:e.target.value})}/></div>
        </div>
        <div className="row2">
          <div><div className="fl">Start Date</div><input className="fi" type="date" value={apprenticeInfo.startDate} onChange={e=>setApprenticeInfo({...apprenticeInfo,startDate:e.target.value})}/></div>
          <div><div className="fl">Training Provider</div><input className="fi" placeholder="e.g. Leeds City College" value={apprenticeInfo.trainingProvider} onChange={e=>setApprenticeInfo({...apprenticeInfo,trainingProvider:e.target.value})}/></div>
        </div>
        <div className="fl">Assessor Name</div>
        <input className="fi" placeholder="e.g. Sarah Jones" value={apprenticeInfo.assessorName} onChange={e=>setApprenticeInfo({...apprenticeInfo,assessorName:e.target.value})}/>
      </div>

      <div className="dashboard-grid">
        <div className="dash-card"><div className="dash-num">{totalHours}</div><div className="dash-label">Hours Logged</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:"#4caf50"}}>{signedOff}</div><div className="dash-label">Competencies Signed Off</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:"#e8a020"}}>{competencies.length - signedOff}</div><div className="dash-label">Still to Complete</div></div>
      </div>

      <div style={{display:"flex",borderBottom:"1px solid #1e1e1e",marginBottom:16}}>
        <button style={tabStyle("log")} onClick={()=>setTab("log")}>Weekly Log</button>
        <button style={tabStyle("competencies")} onClick={()=>setTab("competencies")}>Competencies</button>
        <button style={tabStyle("documents")} onClick={()=>setTab("documents")}>Documents</button>
      </div>

      {tab==="log" && (
        <div>
          <div className="card">
            <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:12,letterSpacing:1}}>LOG WEEKLY HOURS</div>
            <div className="row2">
              <div><div className="fl">Week Ending</div><input className="fi" placeholder="e.g. 18 Apr 2026" value={logForm.week} onChange={e=>setLogForm({...logForm,week:e.target.value})}/></div>
              <div><div className="fl">Hours Worked</div><input className="fi" placeholder="e.g. 40" value={logForm.hours} onChange={e=>setLogForm({...logForm,hours:e.target.value})}/></div>
            </div>
            <div className="fl">Tasks Carried Out</div>
            <textarea className="fi" style={{minHeight:70}} placeholder="Describe what the apprentice worked on this week..." value={logForm.tasks} onChange={e=>setLogForm({...logForm,tasks:e.target.value})}/>
            <div className="fl">Skills Practiced (comma separated)</div>
            <input className="fi" placeholder="e.g. Duct joining, Safe use of tools, Manual handling" value={logForm.skills} onChange={e=>setLogForm({...logForm,skills:e.target.value})}/>
            <div className="fl">Supervised By</div>
            <input className="fi" placeholder={profile.name||"e.g. D. Morris"} value={logForm.supervisor} onChange={e=>setLogForm({...logForm,supervisor:e.target.value})}/>
            <button className="btn-sm" onClick={addLog} style={{width:"100%",padding:"10px",fontSize:13}}>+ LOG THIS WEEK</button>
          </div>
          {logs.length>0 && (
            <div>
              <div style={{fontSize:10,letterSpacing:2,color:"#555",textTransform:"uppercase",marginBottom:10}}>Weekly Log — {logs.length} entries · {totalHours} hours total</div>
              {[...logs].reverse().map(l=>(
                <div key={l.id} className="hist-item">
                  <div className="hist-top">
                    <span className="hist-tool">Week ending {l.week}</span>
                    <span className="hist-date">{l.hours} hours</span>
                  </div>
                  <div style={{fontSize:12,color:"#ccc",marginBottom:6}}>{l.tasks}</div>
                  {l.skills.length>0 && <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{l.skills.map((s,i)=><span key={i} style={{background:"#1a1400",border:"1px solid #e8a02030",borderRadius:3,padding:"1px 7px",fontSize:10,color:"#e8a020"}}>{s}</span>)}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab==="competencies" && (
        <div>
          <div className="card">
            <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:12,letterSpacing:1}}>ADD COMPETENCY</div>
            <div className="row2">
              <div><div className="fl">Skill / Competency</div><input className="fi" placeholder="e.g. Safe use of power tools" value={compForm.skill} onChange={e=>setCompForm({...compForm,skill:e.target.value})}/></div>
              <div><div className="fl">Status</div><select className="fi" value={compForm.status} onChange={e=>setCompForm({...compForm,status:e.target.value})} style={{cursor:"pointer"}}><option>Not Started</option><option>In Progress</option><option>Signed Off</option></select></div>
            </div>
            <button className="btn-sm" onClick={addComp} style={{width:"100%",padding:"10px",fontSize:13}}>+ ADD COMPETENCY</button>
          </div>
          <div className="table-wrap">
            <table><thead><tr><th>Skill / Competency</th><th>Status</th><th>Date Signed Off</th><th></th></tr></thead>
            <tbody>{competencies.map(c=>(
              <tr key={c.id}>
                <td style={{color:"#f0ede8"}}>{c.skill}</td>
                <td><span className={`status-pill ${c.status==="Signed Off"?"status-green":c.status==="In Progress"?"status-amber":"status-grey"}`}>{c.status}</span></td>
                <td style={{color:"#555"}}>{c.date||"—"}</td>
                <td style={{display:"flex",gap:6}}>
                  {c.status!=="Signed Off"&&<button className="btn-green" onClick={()=>signOff(c.id)}>Sign Off</button>}
                  <button className="btn-danger" onClick={()=>setCompetencies(x=>x.filter(q=>q.id!==c.id))}>✕</button>
                </td>
              </tr>
            ))}</tbody></table>
          </div>
        </div>
      )}

      {tab==="documents" && (
        <div>
          <div className="card">
            <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:12,letterSpacing:1}}>GENERATE DOCUMENT</div>
            <div className="fl">Document Type</div>
            <select className="fi" value={docType} onChange={e=>setDocType(e.target.value)} style={{cursor:"pointer"}}>
              <option value="offer">Apprenticeship Offer Letter</option>
              <option value="progress">Progress Review Document</option>
              <option value="warning">Formal Warning Letter</option>
            </select>
            <button className="btn" onClick={generateDoc} disabled={loading}>{loading?"GENERATING...":"GENERATE DOCUMENT"}</button>
          </div>
          {loading&&<div className="loading"><div className="spin"/>Writing your document...</div>}
          {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">{docType==="offer"?"Offer Letter":docType==="progress"?"Progress Review":"Formal Warning"}</span><OutputActions title="Apprentice Document" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
        </div>
      )}
    </div>
  );
}

// ── App Shell ─────────────────────────────────────────────────────────────────
export default function App() {
  const [active,setActive]=useState("variation");
  const [trade,setTrade]=useState("Duct Fitter");
  const [tempTrade,setTempTrade]=useState("Duct Fitter");
  const [showTradeModal,setShowTradeModal]=useState(false);
  const [history,setHistory]=useState([]);
  const [profile,setProfile]=useState({name:"",company:"",utr:"",cis:"",phone:"",email:"",bankName:"",sortCode:"",accNum:""});
  const [logo,setLogo]=useState(null);

  const saveDoc=(tool,content)=>{const date=new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});setHistory(h=>[...h,{tool,content,date}]);};
  const sections=[...new Set(TOOLS.map(t=>t.section))];

  const renderTool=()=>{
    const p={trade,profile,logo,onSave:saveDoc};
    if(active==="cis") return <CISCalc/>;
    if(active==="selfassess") return <SelfAssess/>;
    if(active==="earnings") return <EarningsDashboard/>;
    if(active==="chaser") return <PaymentChaser {...p}/>;
    if(active==="photos") return <PhotoLog/>;
    if(active==="verbal") return <VerbalRecorder {...p}/>;
    if(active==="contract") return <ContractReview {...p}/>;
    if(active==="dispute") return <DisputeTimeline {...p}/>;
    if(active==="incident") return <IncidentReport {...p}/>;
    if(active==="toolboxtalk") return <ToolboxTalk {...p}/>;
    if(active==="asbestos") return <AsbestosRecord/>;
    if(active==="snagging") return <SnaggingList {...p}/>;
    if(active==="reminders") return <Reminders/>;
    if(active==="subcomanage") return <SubcoManage/>;
    if(active==="vartracker") return <VarTracker/>;
    if(active==="ramslibrary") return <RAMSLibrary {...p}/>;
    if(active==="contractmgmt") return <ContractMgmt/>;
    if(active==="multidiary") return <MultiDiary/>;
    if(active==="paytracker") return <PayTracker/>;
    if(active==="incidentlog") return <IncidentLogFirm/>;
    if(active==="apprentice") return <ApprenticeManager {...p}/>;
    if(active==="history") return <History history={history} onDelete={i=>setHistory(h=>h.filter((_,j)=>j!==h.length-1-i))}/>;
    if(active==="profile") return <Profile profile={profile} setProfile={setProfile} logo={logo} setLogo={setLogo}/>;
    if(toolConfigs[active]) return <DocTool key={active} toolId={active} {...p}/>;
    return null;
  };

  return(
    <>
      <style>{css}</style>
      <div className="app">
        <div className="header">
          <div className="logo">MORRIS<span>.</span></div>
          <div className="header-right">
            {history.length>0&&<span className="tag">{history.length} saved</span>}
            <button className="trade-pill" onClick={()=>{setTempTrade(trade);setShowTradeModal(true);}}>⚙ {trade}</button>
          </div>
        </div>
        <div className="layout">
          <div className="sidebar">
            {sections.map(sec=>(<div key={sec}>
              <div className="sec-label">{sec}</div>
              {TOOLS.filter(t=>t.section===sec).map(t=>(<div key={t.id} className={`nav-item ${active===t.id?"active":""}`} onClick={()=>setActive(t.id)}>
                <span className="nav-icon">{t.icon}</span><span className="nav-label">{t.label}</span>
                {t.id==="history"&&history.length>0&&<span style={{marginLeft:"auto",fontSize:10,color:"#e8a020",flexShrink:0}}>{history.length}</span>}
              </div>))}
            </div>))}
          </div>
          <div className="main">{renderTool()}</div>
        </div>
        {showTradeModal&&(<div className="modal-overlay" onClick={()=>setShowTradeModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><h2>Your Trade</h2><p>Morris tailors every document to your trade.</p><div className="trade-grid">{TRADES.map(t=><div key={t} className={`trade-opt ${tempTrade===t?"sel":""}`} onClick={()=>setTempTrade(t)}>{t}</div>)}</div><button className="confirm-btn" onClick={()=>{setTrade(tempTrade);setShowTradeModal(false);}}>CONFIRM TRADE</button></div></div>)}
      </div>
    </>
  );
}
