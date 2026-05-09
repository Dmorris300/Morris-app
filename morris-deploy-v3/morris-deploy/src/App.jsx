import { useState, useRef, useEffect } from "react";

const TRADES = ["Bricklayer","Carpenter & Joiner","Crane Operator","Drainage Engineer","Dry Liner","Duct Fitter","Electrician","EV Charger Installer","Fire Alarm Engineer","Fire Stopper","Floor Layer & Screeder","Gas Engineer","General Builder","Glazier","Groundworker","Lagger","Painter & Decorator","Pipefitter","Plant Operator","Plasterer","Plumber","Refrigeration Engineer","Roofer","Scaffolder","Solar & Renewables Installer","Stonemason","Structural Steel Erector","Suspended Ceiling Fitter","Telecoms Engineer","Traffic Marshal","Wall & Floor Tiler","Welder & Fabricator"];

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
  { id:"scopeworks",  label:"Scope of Works",      icon:"📋", section:"Price Work" },
  { id:"pwvartrack",  label:"Variation Tracker",   icon:"📉", section:"Price Work" },
  { id:"standingtime",label:"Standing Time Calc",  icon:"⏱️", section:"Price Work" },
  { id:"pwprofit",    label:"Profit Calculator",   icon:"💹", section:"Price Work" },
  { id:"verbvariation",label:"Verbal → Variation",  icon:"🎙️⚡",section:"Documents" },
  { id:"phototodoc",   label:"Photo to Document",   icon:"📸✨",section:"Documents" },
  { id:"cispredict",   label:"CIS Refund Predictor",icon:"💰", section:"Finance" },
  { id:"offline",     label:"Offline Mode",        icon:"📡", section:"Account" },
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
  { id:"subcomanage", label:"Subcontractor Mgmt",  icon:"👥", section:"Contractors" },
  { id:"vartracker",  label:"Variation Tracker",   icon:"📉", section:"Contractors" },
  { id:"ramslibrary", label:"RAMS Library",        icon:"📚", section:"Contractors" },
  { id:"contractmgmt",label:"Contract Management", icon:"📄", section:"Contractors" },
  { id:"multidiary",  label:"Multi-user Diary",    icon:"📋", section:"Contractors" },
  { id:"paytracker",  label:"Payment Tracker",     icon:"💳", section:"Contractors" },
  { id:"incidentlog", label:"Incident Log",        icon:"🗂️", section:"Contractors" },
  { id:"labouralloc", label:"Labour Allocation",   icon:"👷", section:"Contractors" },
  { id:"purchaseorder",label:"Purchase Order",     icon:"🛒", section:"Contractors" },
  { id:"subcispay",   label:"Subbi Payment Cert",  icon:"💷", section:"Contractors" },
  { id:"hspolicy",    label:"H&S Policy",          icon:"🛡️", section:"Contractors" },
  { id:"subbicheck",  label:"Subbi Compliance",    icon:"✅", section:"Contractors" },
  { id:"commercialrpt",label:"Commercial Report",  icon:"📊", section:"Contractors" },
  { id:"tenderletter",label:"Tender Letter",       icon:"📨", section:"Contractors" },
  { id:"defectstracker",label:"Defects Tracker",   icon:"🔎", section:"Contractors" },
  { id:"siteaccess",  label:"Site Access Permit",  icon:"🔒", section:"Site Tools" },
  { id:"measurement", label:"Measurement Record",   icon:"📐", section:"Site Tools" },
  { id:"newstarter",  label:"New Starter Pack",     icon:"💼", section:"Contractors" },
  { id:"satisfaction",label:"Client Survey",        icon:"🏆", section:"Documents" },
  { id:"hireagree",   label:"Hire Agreement",       icon:"📡", section:"Contractors" },
  { id:"about",     label:"About Morris",        icon:"⚒️", section:"Account" },
  { id:"favourites", label:"Favourites",           icon:"★", section:"Account" },
  { id:"history",     label:"Doc History",         icon:"📁", section:"Account" },
  { id:"profile",     label:"My Profile",          icon:"👤", section:"Account" },
];

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0d0d0d}
  .app{min-height:100vh;background:#0d0d0d;color:#f0ede8;font-family:'DM Sans',sans-serif;font-size:14px}
  .header{background:#111;border-bottom:1px solid #1e1e1e;padding:0 20px;display:flex;align-items:center;justify-content:space-between;height:54px;position:sticky;top:0;z-index:100}
  .sidebar-search{padding:10px 12px;border-bottom:1px solid #1a1a1a}
  .search-input{width:100%;background:#0d0d0d;border:1px solid #222;border-radius:6px;padding:7px 10px 7px 28px;color:#f0ede8;font-family:'DM Sans',sans-serif;font-size:12px;outline:none;transition:border-color .2s}
  .search-input:focus{border-color:#e8a020}
  .search-input::placeholder{color:#383838}
  .search-wrap{position:relative}
  .search-icon{position:absolute;left:9px;top:50%;transform:translateY(-50%);font-size:11px;color:#444;pointer-events:none}
  .fav-btn{background:none;border:none;cursor:pointer;font-size:12px;opacity:.4;transition:all .2s;flex-shrink:0;padding:0 2px}
  .fav-btn:hover{opacity:1}
  .fav-btn.active{opacity:1}
  .nav-item-row{display:flex;align-items:center;width:100%}
  .no-results{padding:20px 16px;font-size:12px;color:#444;text-align:center}
  .sec-label-row{display:flex;align-items:center;justify-content:space-between;padding:12px 16px 5px;border-top:1px solid #1a1a1a;margin-top:4px}
  .sec-label-row:first-child{border-top:none;margin-top:0}
  .sec-label-text{font-size:9px;letter-spacing:2px;color:#444;text-transform:uppercase}
  .logo{font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:4px;line-height:1}.logo span{color:#e8a020}
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
  .tool-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:3px}
  .info-btn{width:22px;height:22px;border-radius:50%;background:#1a1a1a;border:1px solid #2a2a2a;color:#666;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0;margin-top:6px;font-weight:700}
  .info-btn:hover{border-color:#e8a020;color:#e8a020;background:#1a1400}
  .info-popup{background:#1a1400;border:1px solid rgba(232,160,32,.25);border-radius:8px;padding:14px 16px;margin-bottom:16px;font-size:13px;color:#ccc;line-height:1.7;animation:fadeUp .2s ease}
  .info-popup strong{color:#e8a020;display:block;margin-bottom:4px;font-size:11px;letter-spacing:1px;text-transform:uppercase}
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

const TOOL_INFO = {
  variation: "When a site manager asks you to do extra work that wasn't in your original price — this letter puts it in writing. Without it you probably won't get paid for it. Fill in what the extra work was, how much it costs and who told you to do it. Send it before you start the extra work.",
  rams: "RAMS stands for Risk Assessment and Method Statement. Most commercial sites won't let you start work without one. It describes what you're doing, what could go wrong and how you're going to stay safe. This tool writes a professional one for your specific trade and task.",
  diary: "A daily record of what you did on site, who was there and any problems or instructions you received. If anyone ever disputes what happened on a job — your site diary is your proof. Get into the habit of filling it in every evening.",
  quote: "A professional written quote for a client before you start a job. It describes exactly what you're going to do, what it costs and — importantly — what is NOT included. That last part protects you from clients adding things without paying.",
  invoice: "A CIS-compliant invoice to send to a contractor or client after completing work. It includes the correct tax deductions under the Construction Industry Scheme so you get paid the right amount and everything is above board with HMRC.",
  delay: "When you can't do your work because something or someone is stopping you — this letter records it formally. Maybe another trade isn't finished, materials haven't arrived or you weren't given access. Without this letter you can't claim back the time you lost.",
  handover: "A formal document you use when a job is complete and you're handing it over to the client or main contractor. Both sides sign it. It starts the clock on the defects period and gives you the right to chase your final payment.",
  subcontract: "A simple written agreement between you and someone working under you, or between you and the contractor who appointed you. It sets out what work is being done, what it costs and how payment works. Stops arguments before they start.",
  complaint: "When you've tried everything else and someone still won't pay or won't sort out a serious problem — this is a formal letter that shows you mean business. It references your legal rights and sets a clear deadline. Many contractors pay up as soon as they receive one.",
  timesheet: "A weekly record of the hours you worked and where. Get it signed by your site supervisor every week. If a contractor ever claims you worked fewer days than you did — your signed timesheet is your proof.",
  chaser: "When an invoice hasn't been paid on time — this sends a formal letter chasing payment. There are three stages: a friendly reminder, a firmer warning and a final legal threat. Each one is stronger than the last. Most contractors pay before you reach stage three.",
  cis: "This calculates exactly how much HMRC owes you back at the end of the tax year. Most subbies have 20% taken off every payment but their actual tax bill is lower — so they're owed money back. This tool shows you the number in 30 seconds.",
  selfassess: "Helps you organise everything you need before doing your self assessment tax return. Log your income, expenses and business mileage throughout the year so everything is ready when January comes — instead of scrambling for receipts.",
  pricequote: "Like the quote builder but specifically for fixed price jobs where you agree one total price for all the work. Very important to list exactly what's included and what isn't — so if the job changes, you can charge for the extra work.",
  earnings: "Shows you exactly how much you've earned, what's still owed to you and what you're spending on business expenses. Also lets you scan receipts so everything is tracked in one place for your tax return.",
  mileage: "Every mile you drive for work can be claimed back from HMRC at 45p per mile. This tool tracks your journeys automatically and calculates how much you're owed. Most tradespeople miss this — it can add up to over £1,000 per year.",
  photos: "Upload photos from site and they get saved with a date and time stamp. If you ever need to prove what condition something was in, what extra work you did or what was there before you arrived — these photos are your visual evidence.",
  verbal: "Press record when a site manager gives you an instruction verbally. Morris converts what was said into a formal written record. Send it to them by email the same day. If they ever say they didn't instruct something — you have proof they did.",
  contract: "Paste in a subcontract before you sign it and Morris checks it for anything dodgy. Things like unfair payment terms, too much retention, clauses that take away your rights or make you liable for things that aren't your fault.",
  dispute: "When a job goes wrong and it's heading toward a formal dispute — this tool helps you build a timeline of everything that happened in the right order. It then generates a formal summary you can use if you need to go to adjudication.",
  incident: "If something goes wrong on site — a theft, an injury, damage to property — fill this in immediately while the details are fresh. Your insurer will need this if you make a claim. Without a contemporaneous record, claims are much harder to pursue.",
  reminders: "Set reminders for important dates — when to chase an invoice, when your insurance renews, when a tax deadline is coming. Saves you from missing things that could cost you money.",
  toolboxtalk: "A short safety briefing you give to your team before starting a new task or at the start of the day. Most commercial sites require them. This tool generates a professional briefing for 15 different topics — working at height, manual handling, fire safety and more.",
  asbestos: "A record of everyone who has received asbestos awareness training, when they received it and who delivered it. If you work in older buildings you're legally required to have this training and to keep records of it.",
  snagging: "A formal list of defects or items that need fixing at the end of a job. Both you and the client or contractor sign it. Means your final payment can only be withheld for things actually on the list — not things they think of later.",
  hmrc: "When HMRC sends you a letter and you need to write back professionally — this tool helps. Whether it's a tax query, a penalty notice or a CIS question, Morris writes a clear formal response.",
  reference: "A professional reference letter — either one you're requesting from a contractor you've worked for, or one Morris generates based on the work you've done. Useful when applying to new contractors or approved supplier lists.",
  rateincrease: "A professional letter telling a client or contractor that your rates are going up. It's warm but confident. Acknowledges the working relationship, gives proper notice and explains the reason — so it lands well rather than causing friction.",
  apprentice: "Manages everything to do with taking on an apprentice. Log their weekly hours, sign off the skills they've learned, track their progress and generate the documents their training provider needs.",
  subcomanage: "If you're running a team of subbies — this tracks who's working for you, on which project, how much they've invoiced and how much you've paid them. Gives you a clear picture of your subbi spend at a glance.",
  vartracker: "When you have multiple variation claims going in on different projects — this tracks all of them. You can see which ones have been approved, which are still waiting and which are being disputed. Stops money slipping through the cracks.",
  ramslibrary: "A library of reusable RAMS templates for your most common tasks. Generate one, save it, adapt it for each new site. Much faster than starting from scratch every time.",
  contractmgmt: "Tracks all your active contracts in one place — contract values, how much has been certified, retention being held and when it's due for release. Gives you a clear financial picture across all your work.",
  multidiary: "Like the site diary but for a whole team. Everyone logs their day from their own phone and it all feeds into one company diary. Useful if you're running multiple people across multiple sites.",
  paytracker: "Tracks every invoice you've raised — which ones have been paid, which are overdue and which are being disputed. Means you always know exactly where your money is.",
  incidentlog: "A company-wide record of every incident across all your sites — near misses, injuries, damage, theft. Essential for HSE compliance and invaluable if you're ever inspected or face a legal claim.",
  labouralloc: "Shows which workers are on which site each day. Useful when you're running multiple sites and need to make sure you're not short-staffed anywhere or doubling up people where they're not needed.",
  purchaseorder: "A formal purchase order when you're ordering materials or hiring plant. Gives the supplier a clear written record of what you've ordered at what price — so there are no surprises on the invoice.",
  subcispay: "The document you must give every subbi you pay under CIS. It shows how much you paid them, how much you deducted for tax and how much they received. HMRC requires you to issue these within 14 days of the end of each tax month.",
  hspolicy: "Every company that employs anyone — even one person — is legally required to have a written health and safety policy. Morris generates a professional one tailored to your trade and the size of your business.",
  subbicheck: "A checklist to run through before a new subbi starts work for you. Makes sure they're CIS registered, have their insurance, have a CSCS card, have submitted their RAMS and have been inducted on site. Protects you if something goes wrong.",
  commercialrpt: "A monthly summary of all your contracts — how much each one is worth, how much has been certified, how much you've been paid, how much is outstanding and how much retention is being held. Gives you a clear picture of your business finances.",
  tenderletter: "A professional cover letter to send with a tender when you're bidding for work. Sets out why your company is the right choice for the job. A strong cover letter can make the difference between winning and losing work at the same price.",
  defectstracker: "Tracks the defects liability period on each completed contract and tells you exactly when the retention is due to be released. Most firms miss out on thousands every year simply because nobody was tracking the release dates.",
  siteaccess: "A formal document authorising a worker to access a restricted area on site — like a confined space, plant room or roof. Most commercial sites require a signed permit before anyone can enter these areas.",
  measurement: "A formal record of measurements you've taken on site. When dimensions don't match the drawings and you need to prove what you actually measured and installed — this signed record is your evidence.",
  newstarter: "A complete pack of documents for every new person who starts working for you. Covers their terms, site rules, emergency contacts, health and safety responsibilities and everything they need to sign before they start.",
  satisfaction: "A short professional survey you send to a client after completing a job. Captures their feedback and — if they're happy — asks for a testimonial and a Google review. Positive reviews win you more work.",
  hireagree: "A formal agreement when you're hiring plant or equipment in or out. Covers the hire rate, who's responsible for damage, insurance requirements and what happens if it gets returned late or damaged.",
  verbvariation: "Press record on site when a manager gives you a verbal instruction. Speak for 30 seconds. Morris converts it into a formal variation letter instantly — ready to send before the manager walks away. 45 seconds from verbal instruction to sent letter.",
  phototodoc: "Take a photo of a handwritten note, delivery note, damaged material or site condition. Morris reads the photo and converts it into a formal professional document automatically. No typing needed.",
  contractscan: "Paste your subcontract into Morris before you sign it. Morris reads the whole thing and gives you a traffic light report — green clauses are fine, amber need attention, red are dangerous. Plain English explanation of every risk.",
  paypredict: "Enter a contractor's company name before you start work. Morris checks their background and gives you a payment probability score. Know the likelihood of getting paid before you lift a tool.",
  cispredict: "See exactly how much HMRC owes you back at year end — updated in real time as you log each payment. By January you already know the number before you file.",
  morrisscore: "Your personal commercial protection score out of 100. Goes up every time you use a Morris protection tool. Shows contractors you document everything professionally.",
  pwvartrack: "Tracks every change from your original scope in real time as the job progresses. Log each variation with a date, description and cost. By the end of the job you have a complete record of every extra — ready for your final account.",
  standingtime: "When you can't work because of delays — enter your gang size, their rates and how long you were standing. Morris calculates the total cost and generates a formal standing time claim. On price work this is often the difference between profit and loss.",
  pwprofit: "Track your actual costs against the fixed price as the job progresses. Log labour hours, materials and plant daily. Morris shows your running margin in real time so you know if you're making or losing money before it's too late.",
  offline: "Save tools and draft documents to use when you have no signal on site. Everything you save here stays available offline. When your signal comes back Morris syncs automatically.",
  history: "Every document you save in Morris appears here. Your complete record of everything you've generated — useful for referencing old documents or resending something you created previously.",
  profile: "Set up your name, company, UTR, bank details and logo once. Morris automatically fills these into every document you generate — so you never have to type them out again.",
};

// ── Info Button Component ─────────────────────────────────────────────────────
function InfoButton({toolId}) {
  const [show, setShow] = useState(false);
  const info = TOOL_INFO[toolId];
  if(!info) return null;
  return(
    <div style={{position:"relative"}}>
      <button className="info-btn" onClick={()=>setShow(!show)} title="What does this tool do?">i</button>
      {show&&(
        <div className="info-popup" style={{position:"absolute",right:0,top:32,width:320,zIndex:50,boxShadow:"0 8px 32px rgba(0,0,0,.6)"}}>
          <strong>What this tool does</strong>
          {info}
          <button onClick={()=>setShow(false)} style={{background:"none",border:"none",color:"#e8a020",fontSize:11,cursor:"pointer",marginTop:8,padding:0,letterSpacing:1}}>CLOSE ✕</button>
        </div>
      )}
    </div>
  );
}


const toolConfigs = {
  variation:{title:"Variation Letter",sub:"Professional variation order letter",fields:[{id:"project",label:"Project Name / Address",ph:"e.g. Unit 4, Trafford Park"},{id:"contractor",label:"Main Contractor",ph:"e.g. Balfour Beatty"},{id:"description",label:"Description of Variation Works",ph:"Describe the additional works..."},{id:"cost",label:"Estimated Cost (£)",ph:"e.g. 1,250"},{id:"reason",label:"Reason / Instruction Received From",ph:"e.g. Site manager instructed verbally on..."}],prompt:(f,t,p)=>`Write a professional variation order letter from a ${t} subcontractor.\nFrom: ${p.name||"[Name]"}, ${p.company||"[Company]"}, UTR: ${p.utr||"[UTR]"}\nProject: ${f.project}, Contractor: ${f.contractor}\nWorks: ${f.description}, Cost: £${f.cost}, Reason: ${f.reason}\nClear, direct, written by an experienced contractor. Reference number, today's date placeholder, signature block. Sound like someone who knows construction law and means business.\nTone: Direct, professional, written by an experienced contractor — not by a robot. Use construction industry language. Avoid overly formal or flowery phrasing. Get to the point.`},
  rams:{title:"RAMS",sub:"Risk Assessment & Method Statement",fields:[{id:"task",label:"Task / Activity",ph:"e.g. Ductwork installation at high level"},{id:"location",label:"Site Location",ph:"e.g. Level 3, Block B"},{id:"hazards",label:"Main Hazards",ph:"e.g. Working at height, manual handling..."},{id:"controls",label:"Control Measures",ph:"e.g. MEWP, PPE, spotter in place..."}],prompt:(f,t,p)=>`Write a professional RAMS for a ${t}.\nCompany: ${p.company||"[Company]"}\nTask: ${f.task}, Location: ${f.location}\nHazards: ${f.hazards}, Controls: ${f.controls}\nInclude: scope, task sequence, hazard identification table with likelihood/severity ratings, control measures, PPE requirements, emergency procedures, sign-off box. Write as an experienced contractor would — thorough but not overly academic.\nTone: Direct, professional, written by an experienced contractor — not by a robot. Use construction industry language. Avoid overly formal or flowery phrasing. Get to the point.`},
  diary:{title:"Site Diary",sub:"Daily site record — your legal protection",fields:[{id:"date",label:"Date",ph:"e.g. 18 April 2026"},{id:"site",label:"Site / Project",ph:"e.g. Salford Royal Phase 2"},{id:"workers",label:"Workers on Site",ph:"e.g. 3 duct fitters"},{id:"works",label:"Works Carried Out",ph:"Describe what was done today..."},{id:"issues",label:"Issues / Delays / Instructions",ph:"Any problems or verbal instructions..."}],prompt:(f,t,p)=>`Write a professional site diary entry for a ${t} subcontractor.\nCompany: ${p.company||"[Company]"}\nDate: ${f.date}, Site: ${f.site}, Workers: ${f.workers}\nWorks: ${f.works}, Issues: ${f.issues}\nWrite as a factual daily record — clear, concise, past tense. Include weather conditions placeholder, start/finish times, and supervisor signature block. Should read like a real site diary, not a template.\nTone: Direct, professional, written by an experienced contractor — not by a robot. Use construction industry language. Avoid overly formal or flowery phrasing. Get to the point.`},
  quote:{title:"Quote Builder",sub:"Professional quotation document",fields:[{id:"client",label:"Client / Company",ph:"e.g. ABC Construction Ltd"},{id:"project",label:"Project Description",ph:"e.g. Mechanical services floors 1-3"},{id:"scope",label:"Scope of Works",ph:"Detail what is included..."},{id:"price",label:"Total Price (£)",ph:"e.g. 8,500"},{id:"exclusions",label:"Exclusions",ph:"e.g. Commissioning, fire stopping..."}],prompt:(f,t,p)=>`Write a professional quotation from a ${t} subcontractor.\nFrom: ${p.name||"[Name]"}, ${p.company||"[Company]"}\nClient: ${f.client}, Project: ${f.project}\nScope: ${f.scope}, Price: £${f.price}, Exclusions: ${f.exclusions}\nInclude: quote reference number, itemised breakdown, 30-day validity, payment terms (50% upfront option), what's NOT included, assumptions made, and sign-off. Be specific — vague quotes cause disputes.\nTone: Direct, professional, written by an experienced contractor — not by a robot. Use construction industry language. Avoid overly formal or flowery phrasing. Get to the point.`},
  invoice:{title:"Invoice",sub:"CIS-compliant invoice",fields:[{id:"client",label:"Invoice To",ph:"e.g. Main Contractor Ltd"},{id:"works",label:"Works Description",ph:"e.g. Ductwork installation w/e 18/04/26"},{id:"amount",label:"Invoice Amount (£)",ph:"e.g. 3,200"}],prompt:(f,t,p)=>`Write a professional CIS invoice for a ${t} subcontractor.\nFrom: ${p.name||"[Name]"}, ${p.company||"[Company]"}, UTR: ${p.utr||"[UTR]"}\nBank: ${p.bankName||"[Name]"}, Sort: ${p.sortCode||"[Sort]"}, Acc: ${p.accNum||"[Acc]"}\nTo: ${f.client}, Works: ${f.works}, Amount: £${f.amount}\nInclude: invoice number, date, description of works, gross labour amount, materials if applicable, CIS 20% deduction clearly shown, net amount payable, bank details, payment due date (14 days). Clean and professional.\nTone: Direct, professional, written by an experienced contractor — not by a robot. Use construction industry language. Avoid overly formal or flowery phrasing. Get to the point.`},
  delay:{title:"Delay Notice",sub:"Protect yourself from programme delays",fields:[{id:"project",label:"Project",ph:"e.g. New build, Salford"},{id:"contractor",label:"Main Contractor",ph:"e.g. Kier Construction"},{id:"cause",label:"Cause of Delay",ph:"e.g. No access to floor 4..."},{id:"impact",label:"Impact on Programme",ph:"e.g. 3 days lost, completion pushed to 25th April"}],prompt:(f,t,p)=>`Write a formal delay notice from a ${t} subcontractor.\nFrom: ${p.company||"[Company]"}, Project: ${f.project}, Contractor: ${f.contractor}\nCause: ${f.cause}, Impact: ${f.impact}\nFirm, factual, protective. Clearly state what caused the delay, what work was impacted and for how long, and reserve the right to claim for loss and expense. Reference the contract programme. Date and signature block.\nTone: Direct, professional, written by an experienced contractor — not by a robot. Use construction industry language. Avoid overly formal or flowery phrasing. Get to the point.`},
  handover:{title:"Handover Certificate",sub:"Formal completion document",fields:[{id:"project",label:"Project Name",ph:"e.g. Commercial fit-out, Manchester"},{id:"works",label:"Works Completed",ph:"e.g. Mechanical ductwork floors 1-5"},{id:"date",label:"Handover Date",ph:"e.g. 18 April 2026"},{id:"defects",label:"Outstanding Items",ph:"e.g. None"}],prompt:(f,t,p)=>`Write a professional handover certificate for a ${t} subcontractor.\nCompany: ${p.company||"[Company]"}, Project: ${f.project}\nWorks: ${f.works}, Date: ${f.date}, Outstanding: ${f.defects}\nInclude: statement of practical completion, list of outstanding items if any, 12-month defects liability period start date, O&M manual handover note, and dual signature block for contractor and client/employer.\nTone: Direct, professional, written by an experienced contractor — not by a robot. Use construction industry language. Avoid overly formal or flowery phrasing. Get to the point.`},
  subcontract:{title:"Subcontract Letter",sub:"Letter of intent or subcontract award",fields:[{id:"subcontractor",label:"Subcontractor Name",ph:"e.g. Smith Ductwork Ltd"},{id:"works",label:"Scope of Works",ph:"e.g. Supply and fix ductwork level 2..."},{id:"value",label:"Value (£)",ph:"e.g. 12,000"},{id:"start",label:"Start Date",ph:"e.g. 28 April 2026"},{id:"terms",label:"Payment Terms",ph:"e.g. Monthly valuations, 30 days"}],prompt:(f,t,p)=>`Write a professional subcontract appointment letter from a ${t} contractor.\nFrom: ${p.company||"[Company]"}, Subcontractor: ${f.subcontractor}\nWorks: ${f.works}, Value: £${f.value}, Start: ${f.start}, Terms: ${f.terms}\nInclude: clearly defined scope of works, programme dates, CIS obligations, insurance requirements, 5% retention terms and release date, payment terms, variation procedure, and signature blocks for both parties.\nTone: Direct, professional, written by an experienced contractor — not by a robot. Use construction industry language. Avoid overly formal or flowery phrasing. Get to the point.`},
  complaint:{title:"Complaint Letter",sub:"Formal complaint or dispute letter",fields:[{id:"recipient",label:"Recipient / Company",ph:"e.g. ABC Main Contractors Ltd"},{id:"issue",label:"Nature of Complaint",ph:"e.g. Payment withheld without reason..."},{id:"resolution",label:"Resolution Sought",ph:"e.g. Full payment of £4,500 within 7 days"},{id:"history",label:"Previous Attempts",ph:"e.g. Emailed 3 times, called twice..."}],prompt:(f,t,p)=>`Write a formal complaint letter from a ${t} subcontractor.\nFrom: ${p.name||"[Name]"}, ${p.company||"[Company]"}\nTo: ${f.recipient}, Issue: ${f.issue}, Resolution: ${f.resolution}, History: ${f.history}\nFirm and direct. If payment related, reference the Housing Grants Construction and Regeneration Act 1996. State the outstanding amount clearly. Give 7 days to respond. Make clear that adjudication is the next step if no resolution. Don't be aggressive but be absolutely clear.\nTone: Direct, professional, written by an experienced contractor — not by a robot. Use construction industry language. Avoid overly formal or flowery phrasing. Get to the point.`},
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
  const res = await fetch("/api/generate", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ prompt })
  });
  const d = await res.json();
  if(!res.ok) throw new Error(d.error||"API error");
  return d.text || "No output.";
  
}

// ── Output Actions Bar ────────────────────────────────────────────────────────
// ── Login Screen ──────────────────────────────────────────────────────────────
function LoginScreen({onLogin}) {
  const [mode, setMode] = useState("login"); // login | signup | verify
  const [form, setForm] = useState({username:"", password:"", phone:"", otp:""});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState("");

  const getUsers = () => { try { return JSON.parse(localStorage.getItem("morris_users")||"{}"); } catch { return {}; } };
  const saveUsers = (u) => { try { localStorage.setItem("morris_users", JSON.stringify(u)); } catch {} };

  const handleSignup = () => {
    if(!form.username||!form.password||!form.phone){ setError("Please fill in all fields"); return; }
    if(form.username.length < 3){ setError("Username must be at least 3 characters"); return; }
    if(form.password.length < 6){ setError("Password must be at least 6 characters"); return; }
    const users = getUsers();
    if(users[form.username.toLowerCase()]){ setError("Username already taken — choose another"); return; }
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(otp);
    setOtpSent(true);
    setMode("verify");
    setError("");
    alert(`Your verification code is: ${otp}\n\n(In production this would be sent to ${form.phone} via SMS)`);
  };

  const handleVerify = () => {
    if(form.otp !== generatedOtp){ setError("Incorrect code — please try again"); return; }
    const users = getUsers();
    users[form.username.toLowerCase()] = { password: form.password, phone: form.phone, joined: new Date().toISOString() };
    saveUsers(users);
    onLogin(form.username);
  };

  const handleLogin = () => {
    if(!form.username||!form.password){ setError("Please enter your username and password"); return; }
    const users = getUsers();
    const user = users[form.username.toLowerCase()];
    if(!user){ setError("Username not found — please sign up"); return; }
    if(user.password !== form.password){ setError("Incorrect password"); return; }
    onLogin(form.username);
  };

  return(
    <div style={{minHeight:"100vh",background:"#060606",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:400}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:48,letterSpacing:6,color:"#f0ede8",marginBottom:4}}>MORRIS<span style={{color:"#e8a020"}}>.</span></div>
          <div style={{fontSize:12,color:"#555",letterSpacing:2,textTransform:"uppercase"}}>Built on the Tools</div>
        </div>
        <div style={{background:"#0d0d0d",border:"1px solid rgba(232,160,32,.15)",borderRadius:12,padding:32}}>
          {mode==="verify"?(
            <>
              <div style={{fontSize:14,color:"#f0ede8",fontWeight:600,marginBottom:8}}>Verify your phone</div>
              <div style={{fontSize:12,color:"#666",marginBottom:24}}>Enter the 6 digit code sent to {form.phone}</div>
              <div style={{fontSize:11,color:"#e8a020",marginBottom:6,letterSpacing:1}}>VERIFICATION CODE</div>
              <input style={{width:"100%",background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:"12px 14px",color:"#f0ede8",fontSize:20,letterSpacing:8,textAlign:"center",outline:"none",marginBottom:16,boxSizing:"border-box"}} placeholder="000000" maxLength={6} value={form.otp} onChange={e=>setForm({...form,otp:e.target.value})}/>
              {error&&<div style={{fontSize:12,color:"#e05050",marginBottom:12}}>{error}</div>}
              <button onClick={handleVerify} style={{width:"100%",background:"linear-gradient(135deg,#e8a020,#c8780a)",border:"none",borderRadius:6,padding:"14px",color:"#000",fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:3,cursor:"pointer"}}>VERIFY & LOGIN</button>
              <button onClick={()=>setMode("signup")} style={{width:"100%",background:"none",border:"none",color:"#555",fontSize:12,cursor:"pointer",marginTop:12}}>Back</button>
            </>
          ):(<>
            <div style={{display:"flex",gap:0,marginBottom:28,background:"#1a1a1a",borderRadius:8,padding:4}}>
              {["login","signup"].map(m=>(<button key={m} onClick={()=>{setMode(m);setError("");}} style={{flex:1,padding:"10px",background:mode===m?"#e8a020":"transparent",border:"none",borderRadius:6,color:mode===m?"#000":"#555",fontFamily:"'Bebas Neue',sans-serif",fontSize:15,letterSpacing:2,cursor:"pointer",transition:"all .2s"}}>{m==="login"?"LOG IN":"SIGN UP"}</button>))}
            </div>
            <div style={{fontSize:11,color:"#e8a020",marginBottom:6,letterSpacing:1}}>USERNAME</div>
            <input style={{width:"100%",background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:"12px 14px",color:"#f0ede8",fontSize:14,outline:"none",marginBottom:14,boxSizing:"border-box",fontFamily:"'DM Sans',sans-serif"}} placeholder="e.g. dmorris" value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/>
            <div style={{fontSize:11,color:"#e8a020",marginBottom:6,letterSpacing:1}}>PASSWORD</div>
            <input type="password" style={{width:"100%",background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:"12px 14px",color:"#f0ede8",fontSize:14,outline:"none",marginBottom:14,boxSizing:"border-box",fontFamily:"'DM Sans',sans-serif"}} placeholder="Min 6 characters" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/>
            {mode==="signup"&&(<>
              <div style={{fontSize:11,color:"#e8a020",marginBottom:6,letterSpacing:1}}>PHONE NUMBER</div>
              <input style={{width:"100%",background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:6,padding:"12px 14px",color:"#f0ede8",fontSize:14,outline:"none",marginBottom:14,boxSizing:"border-box",fontFamily:"'DM Sans',sans-serif"}} placeholder="e.g. 07700 000000" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
            </>)}
            {error&&<div style={{fontSize:12,color:"#e05050",marginBottom:12}}>{error}</div>}
            <button onClick={mode==="login"?handleLogin:handleSignup} style={{width:"100%",background:"linear-gradient(135deg,#e8a020,#c8780a)",border:"none",borderRadius:6,padding:"14px",color:"#000",fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:3,cursor:"pointer",marginBottom:16}}>{mode==="login"?"LOG IN TO MORRIS":"CREATE ACCOUNT"}</button>
            {mode==="login"&&<div style={{fontSize:12,color:"#555",textAlign:"center"}}>No account? <span onClick={()=>setMode("signup")} style={{color:"#e8a020",cursor:"pointer"}}>Sign up free</span></div>}
          </>)}
        </div>
        <div style={{textAlign:"center",marginTop:20,fontSize:11,color:"#333"}}>Morris Construction Tech Ltd · ICO Reg: C1923529</div>
      </div>
    </div>
  );
}


   function OutputActions({title, output, profile, logo, onSave}) {  function OutputActions({title, output, profile, logo, onSave}) { const [copied,setCopied]=useState(false);
  const [saved,setSaved]=useState(false);
  const copy=()=>{navigator.clipboard.writeText(output);setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const save=()=>{onSave(title,output);setSaved(true);setTimeout(()=>setSaved(false),2000);};
  const pdf=()=>generatePDF(title,output,profile,logo);
  const email=()=>window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(output)}`);
  const whatsapp=()=>{
    const text=`*${title}*\n\n${output}\n\n_Generated by Morris — morrisapp.co.uk_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank");
  };
  const whatsappPDF=()=>{
    generatePDF(title,output,profile,logo);
    setTimeout(()=>{
      const text=`*${title}*\n\nPDF document attached — generated by Morris.\n_Morris Construction Tech Ltd — morrisapp.co.uk_`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank");
    },1500);
  };
  return (
    <div className="out-actions">
      <button className="save-btn" onClick={save}>{saved?"Saved ✓":"Save"}</button>
      <button className="copy-btn" onClick={copy}>{copied?"Copied ✓":"Copy"}</button>
      <button className="pdf-btn" onClick={pdf}>📄 PDF</button>
      <button className="email-btn" onClick={email}>✉ Email</button>
      <button className="wa-btn" onClick={whatsapp}>💬 WhatsApp</button>
      <button className="wa-btn" onClick={whatsappPDF} style={{background:"rgba(37,211,102,.08)",borderColor:"rgba(37,211,102,.25)",color:"#25d366"}}>📄→WhatsApp</button>
    </div>
  );
}
// ── Shared Doc Tool ───────────────────────────────────────────────────────────
function DocTool({ toolId, trade, profile, logo, onSave, favourites, toggleFav }) {
  const cfg = toolConfigs[toolId];
  const [fields,setFields]=useState({});
  const [output,setOutput]=useState(""); const [loading,setLoading]=useState(false);
  const generate=async()=>{setLoading(true);setOutput("");try{setOutput(await callMorris(cfg.prompt(fields,trade,profile)));}catch{setOutput("Something went wrong our end — give it another go.");}setLoading(false);};
  return (
    <div>
      <div className="tool-header">
        <div className="tool-title">{cfg.title}</div>
        <div style={{display:"flex",gap:6}}>
          <FavButton toolId={toolId} favourites={favourites} toggleFav={toggleFav}/>
          <InfoButton toolId={toolId}/>
        </div>
      </div>
      <div className="tool-sub">{cfg.sub} — tailored for <span>{trade}</span></div>
      <div className="card">
        {cfg.fields.map(f=>(<div key={f.id}><div className="fl">{f.label}</div><input className="fi" placeholder={f.ph} value={fields[f.id]||""} onChange={e=>setFields({...fields,[f.id]:e.target.value})}/></div>))}
        <button className="btn" onClick={generate} disabled={loading}>{loading?"MORRIS IS WRITING...":`GENERATE ${cfg.title.toUpperCase()}`}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Morris is writing your document...</div>}
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
   function OutputActions({title, output, profile, logo, onSave}) {  function OutputActions({title, output, profile, logo, onSave}) { const [copied,setCopied]=useState(false);

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
      <div className="tool-header">
        <div className="tool-title">Verbal Instruction Recorder</div>
        <div style={{display:"flex",gap:6}}><FavButton toolId="verbal" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="verbal"/></div>
      </div>
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
      <div className="tool-header">
        <div className="tool-title">Earnings Dashboard</div>
        <div style={{display:"flex",gap:6}}><FavButton toolId="earnings" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="earnings"/></div>
      </div>
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
      <div className="tool-header">
        <div className="tool-title">CIS Calculator</div>
        <div style={{display:"flex",gap:6}}><FavButton toolId="cis" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="cis"/></div>
      </div>
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
      <div className="tool-header">
        <div className="tool-title">Self Assessment Prep</div>
        <div style={{display:"flex",gap:6}}><FavButton toolId="selfassess" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="selfassess"/></div>
      </div>
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
    try{setOutput(await callMorris(p));}catch{setOutput("Something went wrong our end — give it another go.");}setLoading(false);
  };
  return (
    <div>
      <div className="tool-header">
        <div className="tool-title">Payment Chaser</div>
        <div style={{display:"flex",gap:6}}><FavButton toolId="chaser" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="chaser"/></div>
      </div>
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
      <div className="tool-header">
        <div className="tool-title">Photo Evidence Log</div>
        <div style={{display:"flex",gap:6}}><FavButton toolId="photos" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="photos"/></div>
      </div>
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
  const review=async()=>{if(!text.trim())return;setLoading(true);setOutput("");try{setOutput(await callMorris(`Construction contract expert reviewing a subcontract for a ${trade} sole trader in the UK.\n1) Flag unfair/dangerous clauses 2) Check payment terms vs Construction Act 3) Flag retention over 5% 4) Flag clauses removing variation rights 5) Flag unlimited liability 6) Overall risk rating: LOW/MEDIUM/HIGH 7) Plain English summary.\nContract: ${text}\nSpecific and practical. Clear headings. Write for a tradesperson.`));}catch{setOutput("Something went wrong our end — give it another go.");}setLoading(false);};
  return (
    <div>
      <div className="tool-header">
        <div className="tool-title">Contract Review</div>
        <div style={{display:"flex",gap:6}}><FavButton toolId="contract" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="contract"/></div>
      </div>
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
      <div className="tool-header">
        <div className="tool-title">Dispute Timeline</div>
        <div style={{display:"flex",gap:6}}><FavButton toolId="dispute" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="dispute"/></div>
      </div>
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
    try{setOutput(await callMorris(p));}catch{setOutput("Something went wrong our end — give it another go.");}setLoading(false);
  };
  return (
    <div>
      <div className="tool-header"><div className="tool-title">Incident Report</div><div style={{display:"flex",gap:6}}><FavButton toolId="incident" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="incident"/></div></div>
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
      <div className="tool-header"><div className="tool-title">Reminders</div><InfoButton toolId="reminders"/></div>
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
  const generate=async()=>{setLoading(true);setOutput("");try{const result=await callMorris(`Write a comprehensive reusable RAMS template for a ${trade} firm.\nTask: ${fields.task||"General works"}, Hazards: ${fields.hazards||"Standard"}, Controls: ${fields.controls||"Standard"}\nReusable template with [PROJECT NAME], [SITE ADDRESS], [DATE] placeholders. Include: scope, hazard table with risk ratings, PPE, sequence, emergency procedures, competency requirements, sign-off page.`);setOutput(result);setLibrary(l=>[...l,{id:Date.now(),task:fields.task||"General RAMS",content:result,date:new Date().toLocaleDateString("en-GB")}]);}catch{setOutput("Something went wrong our end — give it another go.");}setLoading(false);};
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
      <div className="tool-header"><div className="tool-title">My Profile</div><InfoButton toolId="profile"/></div>
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
    try{setOutput(await callMorris(p));}catch{setOutput("Something went wrong our end — give it another go.");}setLoading(false);
  };
  return(
    <div>
      <div className="tool-header"><div className="tool-title">Toolbox Talk</div><div style={{display:"flex",gap:6}}><FavButton toolId="toolboxtalk" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="toolboxtalk"/></div></div>
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
      <div className="tool-header"><div className="tool-title">Asbestos Awareness Record</div><div style={{display:"flex",gap:6}}><FavButton toolId="asbestos" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="asbestos"/></div></div>
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
    try{setOutput(await callMorris(p));}catch{setOutput("Something went wrong our end — give it another go.");}setLoading(false);
  };

  return(
    <div>
      <div className="tool-header"><div className="tool-title">Snagging List</div><div style={{display:"flex",gap:6}}><FavButton toolId="snagging" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="snagging"/></div></div>
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
function ApprenticeManager({trade, profile, logo, onSave, favourites, toggleFav}) {
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
    try { setOutput(await callMorris(prompt)); } catch { setOutput("Something went wrong our end — give it another go."); }
    setLoading(false);
  };

  const tabStyle = (t) => ({
    padding:"8px 16px", cursor:"pointer", fontSize:12, borderBottom:`2px solid ${tab===t?"#e8a020":"transparent"}`,
    color:tab===t?"#e8a020":"#555", background:"none", border:"none", borderBottom:`2px solid ${tab===t?"#e8a020":"transparent"}`,
    transition:"all .2s", fontFamily:"inherit"
  });

  return (
    <div>
      <div className="tool-header"><div className="tool-title">Apprentice Manager</div><div style={{display:"flex",gap:6}}><FavButton toolId="apprentice" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="apprentice"/></div></div>
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
          {loading&&<div className="loading"><div className="spin"/>Morris is writing your document...</div>}
          {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">{docType==="offer"?"Offer Letter":docType==="progress"?"Progress Review":"Formal Warning"}</span><OutputActions title="Apprentice Document" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
        </div>
      )}
    </div>
  );
}

// ── Labour Allocation Sheet ───────────────────────────────────────────────────
function LabourAllocation({favourites=[], toggleFav=()=>{}}) {
  const [allocations, setAllocations] = useState([
    {id:1, worker:"D. Morris", trade:"Duct Fitter", site:"Salford Royal Ph2", date:"05 May 2026", hours:8, notes:"Level 3 installation"},
    {id:2, worker:"J. Smith", trade:"Duct Fitter", site:"Trafford Park Unit 4", date:"05 May 2026", hours:8, notes:"Fan coil connections"},
    {id:3, worker:"M. Jones", trade:"Fitter's Mate", site:"Salford Royal Ph2", date:"05 May 2026", hours:8, notes:"Assisting level 3"},
  ]);
  const [form, setForm] = useState({worker:"", trade:"Duct Fitter", site:"", date:"", hours:"8", notes:""});
  const [showForm, setShowForm] = useState(false);
  const sites = [...new Set(allocations.map(a => a.site))];
  const add = () => {if(!form.worker||!form.site)return; setAllocations(a=>[...a,{...form,id:Date.now(),hours:parseFloat(form.hours)||8}]); setForm({worker:"",trade:"Duct Fitter",site:"",date:"",hours:"8",notes:""}); setShowForm(false);};
  const totalHours = allocations.reduce((s,a)=>s+(parseFloat(a.hours)||0),0);
  const siteSummary = sites.map(s=>({site:s, count:allocations.filter(a=>a.site===s).length, hours:allocations.filter(a=>a.site===s).reduce((sum,a)=>sum+(parseFloat(a.hours)||0),0)}));
  return(
    <div>
      <div className="tool-header"><div className="tool-title">Labour Allocation</div><div style={{display:"flex",gap:6}}><FavButton toolId="labouralloc" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="labouralloc"/></div></div>
      <div className="tool-sub">Who is on which site — daily resource management</div>
      <div className="dashboard-grid">
        <div className="dash-card"><div className="dash-num">{allocations.length}</div><div className="dash-label">Workers Allocated</div></div>
        <div className="dash-card"><div className="dash-num">{sites.length}</div><div className="dash-label">Active Sites</div></div>
        <div className="dash-card"><div className="dash-num">{totalHours}</div><div className="dash-label">Total Hours Today</div></div>
      </div>
      <div className="card" style={{marginBottom:14}}>
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:12,letterSpacing:1}}>SITE SUMMARY</div>
        {siteSummary.map(s=>(<div key={s.site} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #141414"}}>
          <span style={{fontSize:13,color:"#f0ede8"}}>{s.site}</span>
          <span style={{fontSize:12,color:"#aaa"}}>{s.count} workers · {s.hours} hrs</span>
        </div>))}
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button className="btn-sm" onClick={()=>setShowForm(!showForm)}>+ Add Allocation</button></div>
      {showForm&&(<div className="card">
        <div className="row2"><div><div className="fl">Worker Name</div><input className="fi" placeholder="e.g. D. Morris" value={form.worker} onChange={e=>setForm({...form,worker:e.target.value})}/></div><div><div className="fl">Trade</div><input className="fi" placeholder="e.g. Duct Fitter" value={form.trade} onChange={e=>setForm({...form,trade:e.target.value})}/></div></div>
        <div className="row2"><div><div className="fl">Site</div><input className="fi" placeholder="e.g. Salford Royal Ph2" value={form.site} onChange={e=>setForm({...form,site:e.target.value})}/></div><div><div className="fl">Date</div><input className="fi" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div></div>
        <div className="row2"><div><div className="fl">Hours</div><input className="fi" placeholder="e.g. 8" value={form.hours} onChange={e=>setForm({...form,hours:e.target.value})}/></div><div><div className="fl">Notes</div><input className="fi" placeholder="e.g. Level 3 installation" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div></div>
        <button className="btn-sm" onClick={add} style={{width:"100%",padding:"10px",fontSize:13}}>SAVE ALLOCATION</button>
      </div>)}
      <div className="table-wrap"><table><thead><tr><th>Worker</th><th>Trade</th><th>Site</th><th>Hours</th><th>Notes</th><th></th></tr></thead>
      <tbody>{allocations.map(a=>(<tr key={a.id}><td style={{fontWeight:500,color:"#f0ede8"}}>{a.worker}</td><td>{a.trade}</td><td>{a.site}</td><td>{a.hours}</td><td style={{color:"#555"}}>{a.notes}</td><td><button className="btn-danger" onClick={()=>setAllocations(x=>x.filter(q=>q.id!==a.id))}>✕</button></td></tr>))}</tbody></table></div>
    </div>
  );
}

// ── Purchase Order Generator ──────────────────────────────────────────────────
function PurchaseOrder({trade, profile, logo, onSave, favourites, toggleFav}) {
  const [fields, setFields] = useState({});
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const generate = async () => {
    setLoading(true); setOutput("");
    const p = `Write a professional purchase order for a ${trade} contractor.\nFrom: ${profile.company||"[Company]"}\nTo: ${fields.supplier||"[Supplier]"}\nPO Number: ${fields.poNumber||"PO-001"}\nDate: ${fields.date||"[Date]"}\nItems: ${fields.items||"[Items]"}\nTotal value: £${fields.value||"[Value]"}\nDelivery to: ${fields.delivery||"[Site Address]"}\nRequired by: ${fields.required||"[Date]"}\nInclude: PO reference, itemised list, delivery instructions, payment terms (30 days), authorisation signature block, cancellation terms.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Something went wrong our end — give it another go.");}setLoading(false);
  };
  return(
    <div>
      <div className="tool-header"><div className="tool-title">Purchase Order</div><div style={{display:"flex",gap:6}}><FavButton toolId="purchaseorder" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="purchaseorder"/></div></div>
      <div className="tool-sub">Formal purchase orders for materials and plant hire</div>
      <div className="card">
        <div className="row2"><div><div className="fl">Supplier Name</div><input className="fi" placeholder="e.g. Wolseley UK Ltd" value={fields.supplier||""} onChange={e=>setFields({...fields,supplier:e.target.value})}/></div><div><div className="fl">PO Number</div><input className="fi" placeholder="e.g. PO-042" value={fields.poNumber||""} onChange={e=>setFields({...fields,poNumber:e.target.value})}/></div></div>
        <div className="row2"><div><div className="fl">Date</div><input className="fi" type="date" value={fields.date||""} onChange={e=>setFields({...fields,date:e.target.value})}/></div><div><div className="fl">Total Value (£)</div><input className="fi" placeholder="e.g. 4,250" value={fields.value||""} onChange={e=>setFields({...fields,value:e.target.value})}/></div></div>
        <div className="fl">Items / Materials</div><textarea className="fi" style={{minHeight:80}} placeholder="List items, quantities and unit prices..." value={fields.items||""} onChange={e=>setFields({...fields,items:e.target.value})}/>
        <div className="row2"><div><div className="fl">Delivery Address</div><input className="fi" placeholder="e.g. Salford Royal, site entrance" value={fields.delivery||""} onChange={e=>setFields({...fields,delivery:e.target.value})}/></div><div><div className="fl">Required By</div><input className="fi" type="date" value={fields.required||""} onChange={e=>setFields({...fields,required:e.target.value})}/></div></div>
        <button className="btn" onClick={generate} disabled={loading}>{loading?"GENERATING...":"GENERATE PURCHASE ORDER"}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Writing your purchase order...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Purchase Order</span><OutputActions title="Purchase Order" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── Subcontractor CIS Payment Certificate ─────────────────────────────────────
function SubbiPayCert({trade, profile, logo, onSave, favourites, toggleFav}) {
  const [fields, setFields] = useState({});
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const generate = async () => {
    setLoading(true); setOutput("");
    const gross = parseFloat(fields.gross)||0;
    const rate = parseFloat(fields.rate||20)/100;
    const deduction = gross * rate;
    const net = gross - deduction;
    const p = `Write a CIS Payment and Deduction Statement for a ${trade} contractor paying a subcontractor.\nContractor: ${profile.company||"[Company]"}, UTR: ${profile.utr||"[UTR]"}\nSubcontractor: ${fields.subName||"[Name]"}, UTR: ${fields.subUTR||"[UTR]"}\nPeriod: ${fields.period||"[Period]"}\nGross payment: £${gross.toFixed(2)}, CIS deduction rate: ${fields.rate||20}%, Amount deducted: £${deduction.toFixed(2)}, Net paid: £${net.toFixed(2)}\nInclude: contractor and subcontractor details, payment period, gross amount, deduction rate and amount, net payment, statement that deduction has been paid to HMRC, signature block. Compliant with CIS regulations.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Something went wrong our end — give it another go.");}setLoading(false);
  };
  return(
    <div>
      <div className="tool-header"><div className="tool-title">Subbi Payment Certificate</div><div style={{display:"flex",gap:6}}><FavButton toolId="subcispay" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="subcispay"/></div></div>
      <div className="tool-sub">CIS payment and deduction statements — legal requirement</div>
      <div className="info-box"><strong>Legal requirement:</strong> You must give every CIS subcontractor a payment and deduction statement within 14 days of the end of each tax month.</div>
      <div className="card">
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:12,letterSpacing:1}}>SUBCONTRACTOR DETAILS</div>
        <div className="row2"><div><div className="fl">Subcontractor Name</div><input className="fi" placeholder="e.g. D. Morris" value={fields.subName||""} onChange={e=>setFields({...fields,subName:e.target.value})}/></div><div><div className="fl">Subcontractor UTR</div><input className="fi" placeholder="e.g. 1234567890" value={fields.subUTR||""} onChange={e=>setFields({...fields,subUTR:e.target.value})}/></div></div>
        <div className="row2"><div><div className="fl">Payment Period</div><input className="fi" placeholder="e.g. April 2026" value={fields.period||""} onChange={e=>setFields({...fields,period:e.target.value})}/></div><div><div className="fl">Gross Payment (£)</div><input className="fi" placeholder="e.g. 3,200" value={fields.gross||""} onChange={e=>setFields({...fields,gross:e.target.value})}/></div></div>
        <div className="fl">CIS Deduction Rate</div>
        <select className="fi" value={fields.rate||"20"} onChange={e=>setFields({...fields,rate:e.target.value})} style={{cursor:"pointer"}}>
          <option value="20">20% — Standard</option>
          <option value="30">30% — Higher (unverified)</option>
          <option value="0">0% — Gross payment status</option>
        </select>
        {fields.gross&&(<div className="cis-result" style={{marginBottom:14}}>
          <div className="cis-row"><span className="cis-label">Gross Payment</span><span>£{(parseFloat(fields.gross)||0).toFixed(2)}</span></div>
          <div className="cis-row"><span className="cis-label">CIS Deduction ({fields.rate||20}%)</span><span>£{((parseFloat(fields.gross)||0)*(parseFloat(fields.rate||20)/100)).toFixed(2)}</span></div>
          <div className="cis-row"><span>Net Paid to Subcontractor</span><span style={{color:"#4caf50"}}>£{((parseFloat(fields.gross)||0)-(parseFloat(fields.gross)||0)*(parseFloat(fields.rate||20)/100)).toFixed(2)}</span></div>
        </div>)}
        <button className="btn" onClick={generate} disabled={loading}>{loading?"GENERATING...":"GENERATE PAYMENT CERTIFICATE"}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Writing your payment certificate...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">CIS Payment Certificate</span><OutputActions title="CIS Payment Certificate" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── Health and Safety Policy ──────────────────────────────────────────────────
function HSPolicy({trade, profile, logo, onSave, favourites, toggleFav}) {
  const [fields, setFields] = useState({});
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const generate = async () => {
    setLoading(true); setOutput("");
    const p = `Write a comprehensive Health and Safety Policy for a ${trade} contractor.\nCompany: ${profile.company||"[Company]"}\nDirector/Owner: ${profile.name||"[Name]"}\nNumber of employees/subbies: ${fields.employees||"1-10"}\nMain activities: ${fields.activities||"Construction and installation works"}\nInclude: policy statement signed by director, organisation section (responsibilities), arrangements section covering risk assessment, RAMS, PPE, first aid, fire, COSHH, working at height, manual handling, accident reporting, training, welfare. Professional and compliant with Health and Safety at Work Act 1974 and CDM 2015. Review date one year from today.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Something went wrong our end — give it another go.");}setLoading(false);
  };
  return(
    <div>
      <div className="tool-header"><div className="tool-title">Health & Safety Policy</div><div style={{display:"flex",gap:6}}><FavButton toolId="hspolicy" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="hspolicy"/></div></div>
      <div className="tool-sub">Every employer legally needs one — Morris generates it</div>
      <div className="warn-box"><strong>Legal requirement:</strong> If you employ anyone — even one person — you are legally required to have a written H&S policy under the Health and Safety at Work Act 1974.</div>
      <div className="card">
        <div className="row2"><div><div className="fl">Number of Employees / Subbies</div><select className="fi" value={fields.employees||"1-10"} onChange={e=>setFields({...fields,employees:e.target.value})} style={{cursor:"pointer"}}><option>1-10</option><option>11-25</option><option>26-50</option><option>50+</option></select></div><div><div className="fl">Main Business Activities</div><input className="fi" placeholder="e.g. Ductwork installation on commercial sites" value={fields.activities||""} onChange={e=>setFields({...fields,activities:e.target.value})}/></div></div>
        <div className="fl">Additional Hazards or Activities</div>
        <textarea className="fi" style={{minHeight:60}} placeholder="e.g. Working at height, confined spaces, hot works..." value={fields.hazards||""} onChange={e=>setFields({...fields,hazards:e.target.value})}/>
        <button className="btn" onClick={generate} disabled={loading}>{loading?"GENERATING...":"GENERATE H&S POLICY"}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Writing your H&S policy...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Health & Safety Policy</span><OutputActions title="Health and Safety Policy" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
      <div className="warn-box" style={{marginTop:14}}><strong>Important:</strong> Get this reviewed by a qualified H&S consultant before use. Morris produces a starting template — your policy must reflect your specific operations.</div>
    </div>
  );
}

// ── Subcontractor Compliance Checker ──────────────────────────────────────────
function SubbiCompliance({favourites=[], toggleFav=()=>{}}) {
  const [subbies, setSubbies] = useState([
    {id:1, name:"D. Morris Ductwork", trade:"Duct Fitter", cisReg:true, insurance:true, cscs:true, rams:true, induction:true, tax:true},
    {id:2, name:"JS Electrical Ltd", trade:"Electrician", cisReg:true, insurance:true, cscs:true, rams:false, induction:false, tax:true},
  ]);
  const [form, setForm] = useState({name:"", trade:"", cisReg:false, insurance:false, cscs:false, rams:false, induction:false, tax:false});
  const [showForm, setShowForm] = useState(false);
  const checks = [{key:"cisReg",label:"CIS Registered"},{key:"insurance",label:"Insurance"},{key:"cscs",label:"CSCS Card"},{key:"rams",label:"RAMS Submitted"},{key:"induction",label:"Site Inducted"},{key:"tax",label:"UTR Verified"}];
  const add = () => {if(!form.name)return; setSubbies(s=>[...s,{...form,id:Date.now()}]); setForm({name:"",trade:"",cisReg:false,insurance:false,cscs:false,rams:false,induction:false,tax:false}); setShowForm(false);};
  const toggle = (id, key) => setSubbies(s=>s.map(x=>x.id===id?{...x,[key]:!x[key]}:x));
  const getStatus = (s) => {const score=checks.filter(c=>s[c.key]).length; return score===6?"Fully Compliant":score>=4?"Mostly Compliant":"Action Required";};
  const getStatusClass = (s) => {const score=checks.filter(c=>s[c.key]).length; return score===6?"status-green":score>=4?"status-amber":"status-red";};
  return(
    <div>
      <div className="tool-header"><div className="tool-title">Subbi Compliance Checker</div><div style={{display:"flex",gap:6}}><FavButton toolId="subbicheck" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="subbicheck"/></div></div>
      <div className="tool-sub">Confirm every subcontractor is compliant before they start</div>
      <div className="info-box"><strong>Why this matters:</strong> If a non-compliant subbi causes an incident on your site — you as the appointing contractor may share liability. Check compliance before day one.</div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button className="btn-sm" onClick={()=>setShowForm(!showForm)}>+ Add Subcontractor</button></div>
      {showForm&&(<div className="card">
        <div className="row2"><div><div className="fl">Company Name</div><input className="fi" placeholder="e.g. ABC Ductwork Ltd" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div><div><div className="fl">Trade</div><input className="fi" placeholder="e.g. Duct Fitter" value={form.trade} onChange={e=>setForm({...form,trade:e.target.value})}/></div></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
          {checks.map(c=>(<div key={c.key} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:"#0d0d0d",borderRadius:6,border:"1px solid #1a1a1a"}}><input type="checkbox" checked={form[c.key]} onChange={()=>setForm({...form,[c.key]:!form[c.key]})} style={{width:14,height:14,cursor:"pointer"}}/><span style={{fontSize:12,color:"#aaa"}}>{c.label}</span></div>))}
        </div>
        <button className="btn-sm" onClick={add} style={{width:"100%",padding:"10px",fontSize:13}}>SAVE</button>
      </div>)}
      {subbies.map(s=>(<div key={s.id} className="card" style={{marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div><div style={{fontSize:14,fontWeight:500,color:"#f0ede8"}}>{s.name}</div><div style={{fontSize:11,color:"#555"}}>{s.trade}</div></div>
          <span className={`status-pill ${getStatusClass(s)}`}>{getStatus(s)}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
          {checks.map(c=>(<div key={c.key} onClick={()=>toggle(s.id,c.key)} style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",background:s[c.key]?"rgba(76,175,80,.08)":"rgba(224,80,80,.06)",border:`1px solid ${s[c.key]?"rgba(76,175,80,.2)":"rgba(224,80,80,.15)"}`,borderRadius:4,cursor:"pointer",transition:"all .2s"}}>
            <span style={{fontSize:13}}>{s[c.key]?"✓":"✗"}</span>
            <span style={{fontSize:11,color:s[c.key]?"#4caf50":"#e05050"}}>{c.label}</span>
          </div>))}
        </div>
      </div>))}
    </div>
  );
}

// ── Monthly Commercial Report ─────────────────────────────────────────────────
function CommercialReport({trade, profile, logo, onSave, favourites, toggleFav}) {
  const [contracts, setContracts] = useState([
    {id:1, name:"Salford Royal Ph2", contractor:"Kier", value:85000, certified:42500, paid:28000, retention:4250, variations:3200, status:"Active"},
    {id:2, name:"Trafford Park", contractor:"Bowmer & Kirkland", value:32000, certified:28000, paid:28000, retention:1600, variations:0, status:"Defects"},
  ]);
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const totalValue = contracts.reduce((s,c)=>s+c.value,0);
  const totalCertified = contracts.reduce((s,c)=>s+c.certified,0);
  const totalPaid = contracts.reduce((s,c)=>s+c.paid,0);
  const totalRetention = contracts.reduce((s,c)=>s+c.retention,0);
  const totalVariations = contracts.reduce((s,c)=>s+c.variations,0);
  const outstanding = totalCertified - totalPaid;
  const generate = async () => {
    setLoading(true); setOutput("");
    const summary = contracts.map(c=>`${c.name} (${c.contractor}): Contract £${c.value.toLocaleString()}, Certified £${c.certified.toLocaleString()}, Paid £${c.paid.toLocaleString()}, Retention £${c.retention.toLocaleString()}, Variations £${c.variations.toLocaleString()}, Status: ${c.status}`).join("\n");
    const p = `Write a professional monthly commercial report for a ${trade} contractor.\nCompany: ${profile.company||"[Company]"}\nReport period: ${new Date().toLocaleDateString("en-GB",{month:"long",year:"numeric"})}\nContracts:\n${summary}\nTotal contract value: £${totalValue.toLocaleString()}, Total certified: £${totalCertified.toLocaleString()}, Total paid: £${totalPaid.toLocaleString()}, Outstanding: £${outstanding.toLocaleString()}, Retention held: £${totalRetention.toLocaleString()}, Pending variations: £${totalVariations.toLocaleString()}\nInclude: executive summary, contract by contract breakdown, cash position analysis, key risks, actions required, forward look.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Something went wrong our end — give it another go.");}setLoading(false);
  };
  return(
    <div>
      <div className="tool-header"><div className="tool-title">Commercial Report</div><div style={{display:"flex",gap:6}}><FavButton toolId="commercialrpt" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="commercialrpt"/></div></div>
      <div className="tool-sub">Monthly overview of all contracts and cash position</div>
      <div className="dashboard-grid">
        <div className="dash-card"><div className="dash-num">£{(totalValue/1000).toFixed(0)}k</div><div className="dash-label">Total Contract Value</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:"#e8a020"}}>£{(outstanding/1000).toFixed(0)}k</div><div className="dash-label">Outstanding</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:"#e8a020"}}>£{(totalRetention/1000).toFixed(0)}k</div><div className="dash-label">Retention Held</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:"#4caf50"}}>£{(totalVariations/1000).toFixed(0)}k</div><div className="dash-label">Pending Variations</div></div>
      </div>
      <div className="table-wrap" style={{marginBottom:16}}>
        <table><thead><tr><th>Contract</th><th>Value</th><th>Certified</th><th>Paid</th><th>Outstanding</th><th>Retention</th><th>Status</th></tr></thead>
        <tbody>{contracts.map(c=>(<tr key={c.id}><td style={{fontWeight:500,color:"#f0ede8"}}>{c.name}</td><td>£{c.value.toLocaleString()}</td><td>£{c.certified.toLocaleString()}</td><td>£{c.paid.toLocaleString()}</td><td style={{color:(c.certified-c.paid)>0?"#e8a020":"#4caf50"}}>£{(c.certified-c.paid).toLocaleString()}</td><td style={{color:"#e8a020"}}>£{c.retention.toLocaleString()}</td><td><span className={`status-pill ${c.status==="Active"?"status-green":c.status==="Defects"?"status-amber":"status-grey"}`}>{c.status}</span></td></tr>))}</tbody></table>
      </div>
      <button className="btn" onClick={generate} disabled={loading}>{loading?"GENERATING...":"GENERATE COMMERCIAL REPORT"}</button>
      {loading&&<div className="loading"><div className="spin"/>Writing your commercial report...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Commercial Report</span><OutputActions title="Monthly Commercial Report" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── Tender Submission Letter ──────────────────────────────────────────────────
function TenderLetter({trade, profile, logo, onSave, favourites, toggleFav}) {
  const [fields, setFields] = useState({});
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const generate = async () => {
    setLoading(true); setOutput("");
    const p = `Write a professional tender submission cover letter for a ${trade} contractor.\nFrom: ${profile.name||"[Name]"}, ${profile.company||"[Company]"}\nTo: ${fields.recipient||"[Recipient]"}, ${fields.recipientCompany||"[Company]"}\nProject: ${fields.project||"[Project]"}\nTender value: £${fields.value||"[Value]"}\nKey strengths: ${fields.strengths||"Experience, quality, competitive price"}\nPrevious relevant projects: ${fields.projects||"[Previous projects]"}\nWrite a compelling professional tender cover letter that: introduces the company, highlights relevant experience, confirms compliance with tender requirements, expresses enthusiasm for the project, confirms tender validity period, invites questions. Confident, professional and compelling.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Something went wrong our end — give it another go.");}setLoading(false);
  };
  return(
    <div>
      <div className="tool-header"><div className="tool-title">Tender Letter</div><div style={{display:"flex",gap:6}}><FavButton toolId="tenderletter" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="tenderletter"/></div></div>
      <div className="tool-sub">Professional tender submission cover letters that win work</div>
      <div className="card">
        <div className="row2"><div><div className="fl">Recipient Name</div><input className="fi" placeholder="e.g. John Smith, Procurement Manager" value={fields.recipient||""} onChange={e=>setFields({...fields,recipient:e.target.value})}/></div><div><div className="fl">Recipient Company</div><input className="fi" placeholder="e.g. Kier Construction" value={fields.recipientCompany||""} onChange={e=>setFields({...fields,recipientCompany:e.target.value})}/></div></div>
        <div className="row2"><div><div className="fl">Project Name</div><input className="fi" placeholder="e.g. Royal Manchester Hospital Phase 3" value={fields.project||""} onChange={e=>setFields({...fields,project:e.target.value})}/></div><div><div className="fl">Tender Value (£)</div><input className="fi" placeholder="e.g. 245,000" value={fields.value||""} onChange={e=>setFields({...fields,value:e.target.value})}/></div></div>
        <div className="fl">Key Strengths / USPs</div><textarea className="fi" style={{minHeight:60}} placeholder="e.g. 25 years experience, ISO 9001 accredited, local supply chain..." value={fields.strengths||""} onChange={e=>setFields({...fields,strengths:e.target.value})}/>
        <div className="fl">Relevant Previous Projects</div><textarea className="fi" style={{minHeight:60}} placeholder="e.g. Salford Royal Hospital, Manchester Airport Terminal 3..." value={fields.projects||""} onChange={e=>setFields({...fields,projects:e.target.value})}/>
        <button className="btn" onClick={generate} disabled={loading}>{loading?"GENERATING...":"GENERATE TENDER LETTER"}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Writing your tender letter...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Tender Submission Letter</span><OutputActions title="Tender Letter" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── Defects Liability Tracker ─────────────────────────────────────────────────
function DefectsTracker({favourites=[], toggleFav=()=>{}}) {
  const [contracts, setContracts] = useState([
    {id:1, name:"Salford Royal Ph2", contractor:"Kier Construction", handover:"2025-09-15", defectsPeriod:12, retention:4250, status:"In Defects", defects:["Minor seal on level 3 FCU","Access panel misaligned roof plant room"]},
    {id:2, name:"Trafford Park Unit 4", contractor:"Bowmer & Kirkland", handover:"2025-03-01", defectsPeriod:12, retention:1600, status:"Release Due", defects:[]},
  ]);
  const [form, setForm] = useState({name:"", contractor:"", handover:"", defectsPeriod:"12", retention:""});
  const [showForm, setShowForm] = useState(false);
  const add = () => {if(!form.name)return; setContracts(c=>[...c,{...form,id:Date.now(),defectsPeriod:parseInt(form.defectsPeriod)||12,retention:parseFloat(form.retention)||0,status:"In Defects",defects:[]}]); setForm({name:"",contractor:"",handover:"",defectsPeriod:"12",retention:""}); setShowForm(false);};
  const getReleaseDate = (handover, months) => {const d=new Date(handover); d.setMonth(d.getMonth()+parseInt(months)); return d;};
  const getDaysToRelease = (handover, months) => Math.ceil((getReleaseDate(handover,months)-new Date())/(1000*60*60*24));
  const totalRetention = contracts.reduce((s,c)=>s+c.retention,0);
  const dueThisMonth = contracts.filter(c=>{const d=getDaysToRelease(c.handover,c.defectsPeriod); return d<=30&&d>=0;}).length;
  return(
    <div>
      <div className="tool-header"><div className="tool-title">Defects Liability Tracker</div><div style={{display:"flex",gap:6}}><FavButton toolId="defectstracker" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="defectstracker"/></div></div>
      <div className="tool-sub">Track retention release dates — never leave money unclaimed</div>
      <div className="dashboard-grid">
        <div className="dash-card"><div className="dash-num">{contracts.length}</div><div className="dash-label">Contracts in Defects</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:"#e8a020"}}>£{totalRetention.toLocaleString()}</div><div className="dash-label">Total Retention Held</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:dueThisMonth>0?"#4caf50":"#555"}}>{dueThisMonth}</div><div className="dash-label">Releasing This Month</div></div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button className="btn-sm" onClick={()=>setShowForm(!showForm)}>+ Add Contract</button></div>
      {showForm&&(<div className="card">
        <div className="row2"><div><div className="fl">Contract Name</div><input className="fi" placeholder="e.g. Salford Royal Ph2" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div><div><div className="fl">Main Contractor</div><input className="fi" placeholder="e.g. Kier Construction" value={form.contractor} onChange={e=>setForm({...form,contractor:e.target.value})}/></div></div>
        <div className="row2"><div><div className="fl">Handover Date</div><input className="fi" type="date" value={form.handover} onChange={e=>setForm({...form,handover:e.target.value})}/></div><div><div className="fl">Defects Period (months)</div><select className="fi" value={form.defectsPeriod} onChange={e=>setForm({...form,defectsPeriod:e.target.value})} style={{cursor:"pointer"}}><option value="6">6 months</option><option value="12">12 months</option><option value="24">24 months</option></select></div></div>
        <div className="fl">Retention Amount (£)</div><input className="fi" placeholder="e.g. 4,250" value={form.retention} onChange={e=>setForm({...form,retention:e.target.value})}/>
        <button className="btn-sm" onClick={add} style={{width:"100%",padding:"10px",fontSize:13}}>SAVE CONTRACT</button>
      </div>)}
      {contracts.map(c=>{
        const days = getDaysToRelease(c.handover, c.defectsPeriod);
        const releaseDate = getReleaseDate(c.handover, c.defectsPeriod);
        const isOverdue = days < 0;
        const isDueSoon = days >= 0 && days <= 30;
        return(<div key={c.id} className="card" style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
            <div><div style={{fontSize:14,fontWeight:500,color:"#f0ede8",marginBottom:2}}>{c.name}</div><div style={{fontSize:11,color:"#555"}}>{c.contractor}</div></div>
            <span className={`status-pill ${isOverdue?"status-green":isDueSoon?"status-amber":"status-grey"}`}>{isOverdue?"Release Overdue":isDueSoon?"Release Due Soon":"In Defects"}</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:c.defects.length>0?12:0}}>
            <div><div style={{fontSize:10,color:"#555",letterSpacing:1,marginBottom:2}}>RETENTION</div><div style={{fontSize:15,color:"#e8a020",fontWeight:600}}>£{c.retention.toLocaleString()}</div></div>
            <div><div style={{fontSize:10,color:"#555",letterSpacing:1,marginBottom:2}}>RELEASE DATE</div><div style={{fontSize:13,color:isOverdue?"#4caf50":isDueSoon?"#e8a020":"#aaa"}}>{releaseDate.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}</div></div>
            <div><div style={{fontSize:10,color:"#555",letterSpacing:1,marginBottom:2}}>DAYS</div><div style={{fontSize:13,color:isOverdue?"#4caf50":isDueSoon?"#e8a020":"#aaa"}}>{isOverdue?`${Math.abs(days)} overdue`:`${days} remaining`}</div></div>
          </div>
          {c.defects.length>0&&(<div style={{borderTop:"1px solid #1a1a1a",paddingTop:10}}><div style={{fontSize:10,color:"#555",letterSpacing:1,marginBottom:6}}>OUTSTANDING DEFECTS</div>{c.defects.map((d,i)=>(<div key={i} style={{fontSize:12,color:"#888",padding:"3px 0",display:"flex",gap:6}}><span style={{color:"#e8a020"}}>—</span>{d}</div>))}</div>)}
        </div>);
      })}
      <div className="info-box"><strong>Tip:</strong> Chase retention release as soon as the defects period expires. Firms miss thousands every year by not tracking these dates. Morris tracks them for you.</div>
    </div>
  );
}

// ── Favourite Button Component ────────────────────────────────────────────────
function FavButton({toolId, favourites, toggleFav}) {
  const isFav = favourites.includes(toolId);
  return(
    <button
      className="info-btn"
      onClick={()=>toggleFav(toolId)}
      title={isFav?"Remove from favourites":"Add to favourites"}
      style={{color: isFav?"#e8a020":"#666", borderColor: isFav?"rgba(232,160,32,.4)":"#2a2a2a", background: isFav?"rgba(232,160,32,.08)":"#1a1a1a"}}
    >
      {isFav?"★":"☆"}
    </button>
  );
}


function SiteAccessPermit({trade, profile, logo, onSave, favourites, toggleFav}) {
  const [fields, setFields] = useState({type:"Confined Space"});
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const permitTypes = ["Confined Space","Working at Height","Hot Works","Electrical Isolation","Roof Access","Plant Room Access","Excavation","Demolition","Asbestos Area","Other Restricted Zone"];
  const generate = async () => {
    setLoading(true); setOutput("");
    const p = `Write a formal site access permit to work for a ${trade} operative.\nPermit type: ${fields.type}\nProject/Site: ${fields.site||"[Site]"}\nIssued by: ${fields.issuedBy||"[Site Manager]"}\nWorker name: ${fields.worker||profile.name||"[Name]"}, Company: ${profile.company||"[Company]"}\nWork description: ${fields.work||"[Description]"}\nLocation: ${fields.location||"[Location]"}\nDate and time: ${fields.datetime||"[Date/Time]"}\nDuration: ${fields.duration||"[Duration]"}\nHazards identified: ${fields.hazards||"[Hazards]"}\nControls in place: ${fields.controls||"[Controls]"}\nInclude: permit reference number, all key fields, hazard checklist, control measures, PPE required, emergency procedures, expiry time, sign off boxes for issuer and recipient, cancellation conditions. Professional and compliant with CDM 2015.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Something went wrong our end — give it another go.");}setLoading(false);
  };
  return(
    <div>
      <div className="tool-header"><div className="tool-title">Site Access Permit</div><div style={{display:"flex",gap:6}}><FavButton toolId="siteaccess" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="siteaccess"/></div></div>
      <div className="tool-sub">Formal permit to work for restricted areas and hazardous activities</div>
      <div className="warn-box"><strong>Important:</strong> Permits must be issued by a competent person — usually the site manager. Morris generates the document. The site manager must review and sign it.</div>
      <div className="card">
        <div className="fl">Permit Type</div>
        <select className="fi" value={fields.type} onChange={e=>setFields({...fields,type:e.target.value})} style={{cursor:"pointer"}}>{permitTypes.map(t=><option key={t}>{t}</option>)}</select>
        <div className="row2"><div><div className="fl">Site / Project</div><input className="fi" placeholder="e.g. Salford Royal Phase 2" value={fields.site||""} onChange={e=>setFields({...fields,site:e.target.value})}/></div><div><div className="fl">Issued By</div><input className="fi" placeholder="e.g. J. Williams, Site Manager" value={fields.issuedBy||""} onChange={e=>setFields({...fields,issuedBy:e.target.value})}/></div></div>
        <div className="row2"><div><div className="fl">Worker Name</div><input className="fi" placeholder={profile.name||"e.g. D. Morris"} value={fields.worker||""} onChange={e=>setFields({...fields,worker:e.target.value})}/></div><div><div className="fl">Location on Site</div><input className="fi" placeholder="e.g. Roof plant room, level 5" value={fields.location||""} onChange={e=>setFields({...fields,location:e.target.value})}/></div></div>
        <div className="fl">Work to be Carried Out</div>
        <textarea className="fi" style={{minHeight:60}} placeholder="Describe the works requiring access..." value={fields.work||""} onChange={e=>setFields({...fields,work:e.target.value})}/>
        <div className="row2"><div><div className="fl">Date and Start Time</div><input className="fi" type="datetime-local" value={fields.datetime||""} onChange={e=>setFields({...fields,datetime:e.target.value})}/></div><div><div className="fl">Duration</div><input className="fi" placeholder="e.g. 4 hours / Until 17:00" value={fields.duration||""} onChange={e=>setFields({...fields,duration:e.target.value})}/></div></div>
        <div className="row2"><div><div className="fl">Hazards Identified</div><input className="fi" placeholder="e.g. Confined space, poor ventilation..." value={fields.hazards||""} onChange={e=>setFields({...fields,hazards:e.target.value})}/></div><div><div className="fl">Controls in Place</div><input className="fi" placeholder="e.g. Gas monitor, buddy system..." value={fields.controls||""} onChange={e=>setFields({...fields,controls:e.target.value})}/></div></div>
        <button className="btn" onClick={generate} disabled={loading}>{loading?"GENERATING...":"GENERATE ACCESS PERMIT"}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Writing your access permit...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Site Access Permit — {fields.type}</span><OutputActions title="Site Access Permit" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── Site Measurement Record ───────────────────────────────────────────────────
function MeasurementRecord({trade, profile, logo, onSave, favourites, toggleFav}) {
  const [measurements, setMeasurements] = useState([]);
  const [form, setForm] = useState({description:"", dimension:"", location:"", note:"", drawingRef:""});
  const [projectInfo, setProjectInfo] = useState({project:"", date:"", witnessedBy:""});
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const add = () => {if(!form.description||!form.dimension)return; setMeasurements(m=>[...m,{...form,id:Date.now()}]); setForm({description:"",dimension:"",location:"",note:"",drawingRef:""});};
  const generate = async () => {
    if(!measurements.length)return;
    setLoading(true); setOutput("");
    const list = measurements.map((m,i)=>`${i+1}. ${m.description}: ${m.dimension} — Location: ${m.location} — Drawing ref: ${m.drawingRef||"N/A"} — Note: ${m.note||"None"}`).join("\n");
    const p = `Write a formal site measurement record for a ${trade} subcontractor.\nCompany: ${profile.company||"[Company]"}\nProject: ${projectInfo.project||"[Project]"}, Date: ${projectInfo.date||"[Date]"}, Witnessed by: ${projectInfo.witnessedBy||"[Witness]"}\nMeasurements taken:\n${list}\nFormat as a professional site measurement record with: reference number, project details, measurement table, notes on deviations from drawings, declaration that measurements are accurate, signature blocks for operative and witness.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Something went wrong our end — give it another go.");}setLoading(false);
  };
  return(
    <div>
      <div className="tool-header"><div className="tool-title">Measurement Record</div><div style={{display:"flex",gap:6}}><FavButton toolId="measurement" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="measurement"/></div></div>
      <div className="tool-sub">Formal record of site measurements — your evidence when dimensions are disputed</div>
      <div className="info-box"><strong>Why it matters:</strong> When a contractor disputes what you installed, your signed measurement record proves exactly what you found on site and what you built. Photos plus measurements plus signatures is almost unbeatable evidence.</div>
      <div className="card">
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:12,letterSpacing:1}}>PROJECT DETAILS</div>
        <div className="row2"><div><div className="fl">Project / Site</div><input className="fi" placeholder="e.g. Salford Royal Ph2" value={projectInfo.project} onChange={e=>setProjectInfo({...projectInfo,project:e.target.value})}/></div><div><div className="fl">Date</div><input className="fi" type="date" value={projectInfo.date} onChange={e=>setProjectInfo({...projectInfo,date:e.target.value})}/></div></div>
        <div className="fl">Witnessed By</div><input className="fi" placeholder="e.g. J. Williams, Site Manager" value={projectInfo.witnessedBy} onChange={e=>setProjectInfo({...projectInfo,witnessedBy:e.target.value})}/>
      </div>
      <div className="card">
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:12,letterSpacing:1}}>ADD MEASUREMENT</div>
        <div className="row2"><div><div className="fl">Description</div><input className="fi" placeholder="e.g. Main duct run, level 3 north" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div><div><div className="fl">Dimension</div><input className="fi" placeholder="e.g. 24.6m x 600x400mm" value={form.dimension} onChange={e=>setForm({...form,dimension:e.target.value})}/></div></div>
        <div className="row2"><div><div className="fl">Location</div><input className="fi" placeholder="e.g. Corridor 3A to plant room" value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></div><div><div className="fl">Drawing Reference</div><input className="fi" placeholder="e.g. M-103 Rev B" value={form.drawingRef} onChange={e=>setForm({...form,drawingRef:e.target.value})}/></div></div>
        <div className="fl">Notes / Deviations</div><input className="fi" placeholder="e.g. Deviated 200mm north due to structural beam" value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/>
        <button className="btn-sm" onClick={add} style={{width:"100%",padding:"10px",fontSize:13}}>+ ADD MEASUREMENT</button>
      </div>
      {measurements.length>0&&(<><div className="table-wrap"><table><thead><tr><th>#</th><th>Description</th><th>Dimension</th><th>Location</th><th>Drawing Ref</th><th></th></tr></thead>
      <tbody>{measurements.map((m,i)=>(<tr key={m.id}><td style={{color:"#e8a020"}}>{i+1}</td><td>{m.description}</td><td style={{fontFamily:"monospace",color:"#aaa"}}>{m.dimension}</td><td>{m.location}</td><td style={{color:"#555"}}>{m.drawingRef||"—"}</td><td><button className="btn-danger" onClick={()=>setMeasurements(x=>x.filter(q=>q.id!==m.id))}>✕</button></td></tr>))}</tbody></table></div>
      <div style={{marginTop:16}}><button className="btn" onClick={generate} disabled={loading}>{loading?"GENERATING...":"GENERATE MEASUREMENT RECORD"}</button></div></>)}
      {measurements.length===0&&<div className="hist-empty">No measurements logged yet. Add them above.</div>}
      {loading&&<div className="loading"><div className="spin"/>Writing your measurement record...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Site Measurement Record</span><OutputActions title="Site Measurement Record" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── New Starter Pack ──────────────────────────────────────────────────────────
function NewStarterPack({trade, profile, logo, onSave, favourites, toggleFav}) {
  const [fields, setFields] = useState({type:"Employee"});
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const generate = async () => {
    setLoading(true); setOutput("");
    const p = `Write a comprehensive new starter pack for a ${trade} contractor taking on a new ${fields.type}.\nCompany: ${profile.company||"[Company]"}, Director: ${profile.name||"[Name]"}\nNew starter name: ${fields.name||"[Name]"}\nRole: ${fields.role||trade}\nStart date: ${fields.startDate||"[Date]"}\nRate: ${fields.rate||"[Rate]"}\nInclude all of the following sections:\n1. Welcome letter from the director\n2. Key terms of ${fields.type==="Employee"?"employment":"engagement"} — rate, hours, notice period\n3. Site rules and code of conduct\n4. Health and safety responsibilities\n5. Emergency contact form (with spaces to fill in)\n6. Next of kin details form\n7. Tool and equipment responsibility statement\n8. Confidentiality and data protection acknowledgement\n9. Signature page for company and new starter\nProfessional, warm but clear. Compliant with UK employment law.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Something went wrong our end — give it another go.");}setLoading(false);
  };
  return(
    <div>
      <div className="tool-header"><div className="tool-title">New Starter Pack</div><div style={{display:"flex",gap:6}}><FavButton toolId="newstarter" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="newstarter"/></div></div>
      <div className="tool-sub">Complete onboarding pack for every new employee or subbi</div>
      <div className="info-box"><strong>Why it matters:</strong> A professional new starter pack sets expectations clearly from day one. Every person starts with the same information, same rules, same signed agreements. Protects you legally and sets the right tone.</div>
      <div className="card">
        <div className="fl">Starter Type</div>
        <select className="fi" value={fields.type} onChange={e=>setFields({...fields,type:e.target.value})} style={{cursor:"pointer"}}>
          <option value="Employee">Employee</option>
          <option value="Subcontractor">Subcontractor / Subbi</option>
          <option value="Apprentice">Apprentice</option>
          <option value="Labour Only Subbi">Labour Only Subbi</option>
        </select>
        <div className="row2"><div><div className="fl">Name</div><input className="fi" placeholder="e.g. James Smith" value={fields.name||""} onChange={e=>setFields({...fields,name:e.target.value})}/></div><div><div className="fl">Role / Trade</div><input className="fi" placeholder={`e.g. ${trade}`} value={fields.role||""} onChange={e=>setFields({...fields,role:e.target.value})}/></div></div>
        <div className="row2"><div><div className="fl">Start Date</div><input className="fi" type="date" value={fields.startDate||""} onChange={e=>setFields({...fields,startDate:e.target.value})}/></div><div><div className="fl">Rate / Salary</div><input className="fi" placeholder="e.g. £220/day or £35,000 p.a." value={fields.rate||""} onChange={e=>setFields({...fields,rate:e.target.value})}/></div></div>
        <button className="btn" onClick={generate} disabled={loading}>{loading?"GENERATING...":"GENERATE STARTER PACK"}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Writing your new starter pack...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">New Starter Pack — {fields.type}</span><OutputActions title="New Starter Pack" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
      <div className="warn-box" style={{marginTop:14}}><strong>Important:</strong> Get employment contracts reviewed by an employment law solicitor before use. Morris produces a professional starting template.</div>
    </div>
  );
}

// ── Client Satisfaction Survey ────────────────────────────────────────────────
function ClientSurvey({trade, profile, logo, onSave, favourites, toggleFav}) {
  const [fields, setFields] = useState({});
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const generate = async () => {
    setLoading(true); setOutput("");
    const p = `Write a professional client satisfaction survey and testimonial request for a ${trade} contractor.\nFrom: ${profile.name||"[Name]"}, ${profile.company||"[Company]"}\nClient name: ${fields.client||"[Client]"}\nProject completed: ${fields.project||"[Project]"}\nCompletion date: ${fields.date||"[Date]"}\nInclude two sections:\n1. A short professional covering letter thanking them for their business and requesting 2 minutes to complete the survey\n2. A structured satisfaction survey with: overall satisfaction (1-5), quality of work (1-5), communication (1-5), value for money (1-5), programme delivery (1-5), would they recommend (yes/no), open comments box, testimonial permission checkbox, Google review request with link placeholder, signature and date\nWarm, professional and easy to complete. Ends with a request to leave a Google review.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Something went wrong our end — give it another go.");}setLoading(false);
  };
  return(
    <div>
      <div className="tool-header"><div className="tool-title">Client Satisfaction Survey</div><div style={{display:"flex",gap:6}}><FavButton toolId="satisfaction" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="satisfaction"/></div></div>
      <div className="tool-sub">Professional post-job surveys that generate testimonials and Google reviews</div>
      <div className="info-box"><strong>The best time to ask:</strong> Send this within 48 hours of handover while the client is happy and the job is fresh. That's when you get the best feedback and the best testimonials.</div>
      <div className="card">
        <div className="row2"><div><div className="fl">Client Name / Company</div><input className="fi" placeholder="e.g. ABC Construction Ltd" value={fields.client||""} onChange={e=>setFields({...fields,client:e.target.value})}/></div><div><div className="fl">Project Completed</div><input className="fi" placeholder="e.g. Ductwork installation, level 3" value={fields.project||""} onChange={e=>setFields({...fields,project:e.target.value})}/></div></div>
        <div className="fl">Completion Date</div><input className="fi" type="date" value={fields.date||""} onChange={e=>setFields({...fields,date:e.target.value})}/>
        <button className="btn" onClick={generate} disabled={loading}>{loading?"GENERATING...":"GENERATE SURVEY"}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Writing your survey...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Client Satisfaction Survey</span><OutputActions title="Client Satisfaction Survey" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── Plant and Equipment Hire Agreement ────────────────────────────────────────
function HireAgreement({trade, profile, logo, onSave, favourites, toggleFav}) {
  const [fields, setFields] = useState({direction:"Hiring In"});
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const generate = async () => {
    setLoading(true); setOutput("");
    const isHiringIn = fields.direction === "Hiring In";
    const p = `Write a formal plant and equipment hire agreement for a ${trade} contractor who is ${fields.direction.toLowerCase()} equipment.\n${isHiringIn?"Hirer":"Owner"}: ${profile.company||"[Company]"}, ${profile.name||"[Name]"}\n${isHiringIn?"Owner/Supplier":"Hirer"}: ${fields.otherParty||"[Other Party]"}\nEquipment: ${fields.equipment||"[Equipment]"}\nHire period: ${fields.start||"[Start]"} to ${fields.end||"[End]"}\nHire rate: £${fields.rate||"[Rate]"} ${fields.rateType||"per day"}\nDelivery/Collection: ${fields.delivery||"[Location]"}\nInclude: equipment description and condition on hire, hire period and rates, payment terms, damage liability and excess, insurance requirements, operator competency requirements, return conditions, cancellation terms, signature blocks for both parties. Professional and legally sound.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Something went wrong our end — give it another go.");}setLoading(false);
  };
  return(
    <div>
      <div className="tool-header"><div className="tool-title">Plant & Equipment Hire Agreement</div><div style={{display:"flex",gap:6}}><FavButton toolId="hireagree" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="hireagree"/></div></div>
      <div className="tool-sub">Formal hire agreements — protect your equipment and your money</div>
      <div className="card">
        <div className="fl">Direction</div>
        <select className="fi" value={fields.direction} onChange={e=>setFields({...fields,direction:e.target.value})} style={{cursor:"pointer"}}>
          <option value="Hiring In">Hiring In — I am renting equipment from someone</option>
          <option value="Hiring Out">Hiring Out — I am renting my equipment to someone</option>
        </select>
        <div className="fl">Other Party (Company / Name)</div><input className="fi" placeholder="e.g. ABC Plant Hire Ltd" value={fields.otherParty||""} onChange={e=>setFields({...fields,otherParty:e.target.value})}/>
        <div className="fl">Equipment Description</div><textarea className="fi" style={{minHeight:60}} placeholder="e.g. 12m scissor lift MEWP, serial number XY1234, capacity 230kg" value={fields.equipment||""} onChange={e=>setFields({...fields,equipment:e.target.value})}/>
        <div className="row2"><div><div className="fl">Hire Start Date</div><input className="fi" type="date" value={fields.start||""} onChange={e=>setFields({...fields,start:e.target.value})}/></div><div><div className="fl">Hire End Date</div><input className="fi" type="date" value={fields.end||""} onChange={e=>setFields({...fields,end:e.target.value})}/></div></div>
        <div className="row2"><div><div className="fl">Hire Rate (£)</div><input className="fi" placeholder="e.g. 180" value={fields.rate||""} onChange={e=>setFields({...fields,rate:e.target.value})}/></div><div><div className="fl">Rate Type</div><select className="fi" value={fields.rateType||"per day"} onChange={e=>setFields({...fields,rateType:e.target.value})} style={{cursor:"pointer"}}><option>per day</option><option>per week</option><option>per month</option><option>fixed price</option></select></div></div>
        <div className="fl">Delivery / Collection Location</div><input className="fi" placeholder="e.g. Salford Royal site entrance" value={fields.delivery||""} onChange={e=>setFields({...fields,delivery:e.target.value})}/>
        <button className="btn" onClick={generate} disabled={loading}>{loading?"GENERATING...":"GENERATE HIRE AGREEMENT"}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Writing your hire agreement...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Plant & Equipment Hire Agreement</span><OutputActions title="Hire Agreement" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── About Morris ──────────────────────────────────────────────────────────────
function AboutMorris() {
  return(
    <div>
      <div className="tool-header">
        <div className="tool-title">About Morris</div>
      </div>
      <div className="tool-sub">Built on the tools. For the trades.</div>

      <div className="card" style={{marginBottom:14,borderColor:"rgba(232,160,32,.2)"}}>
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:16,letterSpacing:2}}>THE HONEST STORY</div>
        <p style={{fontSize:14,color:"#ccc",lineHeight:1.8,marginBottom:14}}>
          Morris was built by a duct fitter who got sick of losing money on paperwork.
        </p>
        <p style={{fontSize:14,color:"#ccc",lineHeight:1.8,marginBottom:14}}>
          After years on commercial sites — Salford Royal, Trafford Park, job after job — the same thing kept happening. Extra works instructed verbally. Nothing in writing. End of job comes and the contractor says it was included. Thousands of pounds lost. Every year. To paperwork nobody taught us to write.
        </p>
        <p style={{fontSize:14,color:"#ccc",lineHeight:1.8,marginBottom:14}}>
          So I built Morris. Not a tech company. Not a startup with investors and a ping pong table. Just a duct fitter who decided to fix a problem he lived through personally — and built a tool that every tradesperson in the UK actually needs.
        </p>
        <p style={{fontSize:14,color:"#ccc",lineHeight:1.8}}>
          Every tool in Morris solves a problem I faced on site. That's what makes it different. It wasn't researched. It was lived.
        </p>
        <div style={{marginTop:20,paddingTop:16,borderTop:"1px solid #1a1a1a"}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:3,color:"#e8a020"}}>DEXTER</div>
          <div style={{fontSize:11,color:"#555",letterSpacing:1,marginTop:2}}>DUCT FITTER · FOUNDER · MORRIS CONSTRUCTION TECH LTD</div>
        </div>
      </div>

      <div className="dashboard-grid" style={{marginBottom:14}}>
        <div className="dash-card"><div className="dash-num">57</div><div className="dash-label">Tools Built</div></div>
        <div className="dash-card"><div className="dash-num">29</div><div className="dash-label">Trades Supported</div></div>
        <div className="dash-card"><div className="dash-num">£0</div><div className="dash-label">To Start</div></div>
      </div>

      <div className="card" style={{marginBottom:14}}>
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:16,letterSpacing:2}}>WHAT MORRIS IS NOT</div>
        {["A generic document template site — every tool is built for construction specifically",
          "A legal advice service — Morris helps you document professionally, not replace a solicitor",
          "A complicated system that takes weeks to learn — if you can fill in a form you can use Morris",
          "Built by people who've never been on a building site — this was built from the tools up"
        ].map((t,i)=>(<div key={i} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid #141414",fontSize:13,color:"#888",lineHeight:1.5}}>
          <span style={{color:"#e8a020",flexShrink:0}}>—</span>{t}
        </div>))}
      </div>

      <div className="card" style={{marginBottom:14}}>
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:16,letterSpacing:2}}>PRICING</div>
        {[
          {tier:"Free", price:"£0", desc:"3 tools of your choice, 5 documents per month"},
          {tier:"Solo", price:"£12.99/mo", desc:"All 57 tools, unlimited documents, 1 user"},
          {tier:"Pro", price:"£24.99/mo", desc:"Everything in Solo, 3 users, subcontractor management"},
          {tier:"Business", price:"£59.99/mo", desc:"Everything in Pro, 10 users, full Contractors section"},
        ].map(p=>(<div key={p.tier} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #141414"}}>
          <div><div style={{fontSize:13,fontWeight:600,color:"#f0ede8",marginBottom:2}}>{p.tier}</div><div style={{fontSize:11,color:"#555"}}>{p.desc}</div></div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:"#e8a020",letterSpacing:1,flexShrink:0,marginLeft:12}}>{p.price}</div>
        </div>))}
        <div style={{fontSize:11,color:"#444",marginTop:12}}>Annual subscription available — 2 months free. Cancel anytime.</div>
      </div>

      <div className="card" style={{marginBottom:14}}>
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:16,letterSpacing:2}}>LEGAL</div>
        <p style={{fontSize:12,color:"#555",lineHeight:1.7,marginBottom:8}}>Morris generates professional document templates to help tradespeople protect their interests. Documents generated by Morris are not legal advice. For complex disputes or contract matters, always consult a qualified solicitor.</p>
        <p style={{fontSize:12,color:"#555",lineHeight:1.7,marginBottom:8}}>CIS calculations are for guidance only. Always confirm your tax position with a qualified accountant or HMRC directly.</p>
        <p style={{fontSize:12,color:"#555",lineHeight:1.7}}>Morris Construction Tech Ltd. Registered in England and Wales. ICO Registered. Data processed in accordance with UK GDPR.</p>
      </div>

      <div style={{textAlign:"center",padding:"20px 0"}}>
        <div style={{fontSize:11,color:"#333",letterSpacing:2}}>MORRIS CONSTRUCTION TECH LTD</div>
        <div style={{fontSize:11,color:"#333",letterSpacing:1,marginTop:4}}>hello@morrisapp.co.uk · morrisapp.co.uk</div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:"#1a1a1a",letterSpacing:4,marginTop:12}}>BUILT ON THE TOOLS.</div>
      </div>
    </div>
  );
}

// ── Scope of Works Builder ────────────────────────────────────────────────────
function ScopeOfWorks({trade, profile, logo, onSave, favourites, toggleFav}) {
  const [fields, setFields] = useState({});
  const [included, setIncluded] = useState([""]);
  const [excluded, setExcluded] = useState([""]);
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const updateList = (list, setList, i, val) => { const n=[...list]; n[i]=val; setList(n); };
  const addItem = (list, setList) => setList([...list,""]);
  const removeItem = (list, setList, i) => setList(list.filter((_,j)=>j!==i));
  const generate = async () => {
    setLoading(true); setOutput("");
    const inc = included.filter(x=>x.trim()).join(", ");
    const exc = excluded.filter(x=>x.trim()).join(", ");
    const p = `Write a formal Scope of Works document for a ${trade} subcontractor doing price work.\nCompany: ${profile.company||"[Company]"}, Contractor: ${fields.contractor||"[Contractor]"}\nProject: ${fields.project||"[Project]"}, Zone/Area: ${fields.zone||"[Zone]"}\nFixed Price: £${fields.price||"[Price]"}, Programme: ${fields.programme||"[Programme]"}\nINCLUDED IN PRICE:\n${inc||"[To be listed]"}\nEXCLUDED FROM PRICE (variations chargeable):\n${exc||"[To be listed]"}\nAssumptions: ${fields.assumptions||"None stated"}\nWrite a professional scope of works document that clearly defines the included and excluded items, states the fixed price, programme dates, any assumptions made and declares that anything outside this scope will be valued and agreed as a variation before proceeding. Both parties must sign. Legally clear and professionally formatted.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Error — try again.");}setLoading(false);
  };
  return(
    <div>
      <div className="tool-header">
        <div className="tool-title">Scope of Works</div>
        <div style={{display:"flex",gap:6}}><FavButton toolId="scopeworks" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="scopeworks"/></div>
      </div>
      <div className="tool-sub">Define exactly what's included before price work starts — protect yourself from day one</div>
      <div className="info-box"><strong>Why this matters:</strong> A signed scope of works is your contract. Everything outside it is a variation. Without it — contractors say everything was included. With it — you get paid for every change.</div>
      <div className="card">
        <div className="row2"><div><div className="fl">Contractor</div><input className="fi" placeholder="e.g. IDSL" value={fields.contractor||""} onChange={e=>setFields({...fields,contractor:e.target.value})}/></div><div><div className="fl">Project</div><input className="fi" placeholder="e.g. Salford Royal Ph2" value={fields.project||""} onChange={e=>setFields({...fields,project:e.target.value})}/></div></div>
        <div className="row2"><div><div className="fl">Zone / Area</div><input className="fi" placeholder="e.g. Level 3 North Wing" value={fields.zone||""} onChange={e=>setFields({...fields,zone:e.target.value})}/></div><div><div className="fl">Fixed Price (£)</div><input className="fi" placeholder="e.g. 12,500" value={fields.price||""} onChange={e=>setFields({...fields,price:e.target.value})}/></div></div>
        <div className="fl">Programme</div><input className="fi" placeholder="e.g. 4 weeks — 5 May to 30 May 2026" style={{marginBottom:16}} value={fields.programme||""} onChange={e=>setFields({...fields,programme:e.target.value})}/>
        <div style={{fontSize:11,color:"#4caf50",fontWeight:600,marginBottom:8,letterSpacing:1}}>✓ INCLUDED IN PRICE</div>
        {included.map((item,i)=>(
          <div key={i} style={{display:"flex",gap:8,marginBottom:6}}>
            <input className="fi" style={{marginBottom:0,flex:1}} placeholder={`e.g. ${i===0?"Supply and fix all ductwork as per drawings":i===1?"All associated supports and fixings":"Add item..."}`} value={item} onChange={e=>updateList(included,setIncluded,i,e.target.value)}/>
            {included.length>1&&<button className="btn-danger" onClick={()=>removeItem(included,setIncluded,i)}>✕</button>}
          </div>
        ))}
        <button className="btn-sm" style={{marginBottom:16}} onClick={()=>addItem(included,setIncluded)}>+ Add included item</button>
        <div style={{fontSize:11,color:"#e05050",fontWeight:600,marginBottom:8,letterSpacing:1}}>✗ EXCLUDED FROM PRICE — chargeable as variations</div>
        {excluded.map((item,i)=>(
          <div key={i} style={{display:"flex",gap:8,marginBottom:6}}>
            <input className="fi" style={{marginBottom:0,flex:1}} placeholder={`e.g. ${i===0?"Any works not shown on issue Rev B drawings":i===1?"Additional access hatches":"Add exclusion..."}`} value={item} onChange={e=>updateList(excluded,setExcluded,i,e.target.value)}/>
            {excluded.length>1&&<button className="btn-danger" onClick={()=>removeItem(excluded,setExcluded,i)}>✕</button>}
          </div>
        ))}
        <button className="btn-sm" style={{marginBottom:16}} onClick={()=>addItem(excluded,setExcluded)}>+ Add exclusion</button>
        <div className="fl">Assumptions / Conditions</div>
        <textarea className="fi" style={{minHeight:60}} placeholder="e.g. Price based on unobstructed access. Builders work by others. All drawings at Rev B." value={fields.assumptions||""} onChange={e=>setFields({...fields,assumptions:e.target.value})}/>
        <button className="btn" onClick={generate} disabled={loading}>{loading?"GENERATING...":"GENERATE SCOPE OF WORKS"}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Writing your scope of works...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Scope of Works</span><OutputActions title="Scope of Works" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── Price Work Variation Tracker ──────────────────────────────────────────────
function PWVarTracker({trade, profile, logo, onSave, favourites, toggleFav}) {
  const [variations, setVariations] = useState([
    {id:1, date:"01/05/2026", description:"Additional duct run level 3 east corridor", reason:"Drawing change Rev C", cost:850, status:"Submitted"},
    {id:2, date:"03/05/2026", description:"Relocation of 4 nr supply grilles", reason:"Ceiling grid change", cost:420, status:"Agreed"},
    {id:3, date:"04/05/2026", description:"Additional fire dampers x3 — not on original drawings", reason:"Building control requirement", cost:1200, status:"Pending"},
  ]);
  const [form, setForm] = useState({date:"",description:"",reason:"",cost:"",status:"Pending"});
  const [showForm, setShowForm] = useState(false);
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const statuses = ["Pending","Submitted","Agreed","Disputed","Rejected"];
  const statusColours = {Pending:"#888",Submitted:"#e8a020",Agreed:"#4caf50",Disputed:"#e05050",Rejected:"#555"};
  const add = () => { if(!form.description)return; setVariations(v=>[...v,{...form,id:Date.now(),cost:parseFloat(form.cost)||0}]); setForm({date:"",description:"",reason:"",cost:"",status:"Pending"}); setShowForm(false); };
  const totalValue = variations.reduce((s,v)=>s+v.cost,0);
  const agreedValue = variations.filter(v=>v.status==="Agreed").reduce((s,v)=>s+v.cost,0);
  const pendingValue = variations.filter(v=>v.status==="Pending"||v.status==="Submitted").reduce((s,v)=>s+v.cost,0);
  const generateFinalAccount = async () => {
    setLoading(true); setOutput("");
    const list = variations.map(v=>`${v.date}: ${v.description} — Reason: ${v.reason} — £${v.cost} — Status: ${v.status}`).join("\n");
    const p = `Write a formal variation account summary for a ${trade} subcontractor.\nCompany: ${profile.company||"[Company]"}\nTotal variations: £${totalValue.toLocaleString()}, Agreed: £${agreedValue.toLocaleString()}, Pending: £${pendingValue.toLocaleString()}\nVariations:\n${list}\nWrite a professional final account covering letter that summarises all variations, groups them by status, states the total claimed and requests formal agreement within 14 days. Professional and firm.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Error — try again.");}setLoading(false);
  };
  return(
    <div>
      <div className="tool-header">
        <div className="tool-title">PW Variation Tracker</div>
        <div style={{display:"flex",gap:6}}><FavButton toolId="pwvartrack" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="pwvartrack"/></div>
      </div>
      <div className="tool-sub">Track every scope change on price work — generate your final account</div>
      <div className="dashboard-grid">
        <div className="dash-card"><div className="dash-num">£{totalValue.toLocaleString()}</div><div className="dash-label">Total Claimed</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:"#4caf50"}}>£{agreedValue.toLocaleString()}</div><div className="dash-label">Agreed</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:"#e8a020"}}>£{pendingValue.toLocaleString()}</div><div className="dash-label">Pending</div></div>
        <div className="dash-card"><div className="dash-num">{variations.length}</div><div className="dash-label">Total Variations</div></div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button className="btn-sm" onClick={()=>setShowForm(!showForm)}>+ Add Variation</button></div>
      {showForm&&(<div className="card">
        <div className="row2"><div><div className="fl">Date</div><input className="fi" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div><div><div className="fl">Cost (£)</div><input className="fi" placeholder="e.g. 850" value={form.cost} onChange={e=>setForm({...form,cost:e.target.value})}/></div></div>
        <div className="fl">Description of Variation</div><input className="fi" placeholder="e.g. Additional duct run level 3 east corridor" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/>
        <div className="fl">Reason / Cause</div><input className="fi" placeholder="e.g. Drawing change Rev C" value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/>
        <div className="fl">Status</div>
        <select className="fi" value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{cursor:"pointer",marginBottom:12}}>{statuses.map(s=><option key={s}>{s}</option>)}</select>
        <button className="btn-sm" onClick={add} style={{width:"100%",padding:"10px",fontSize:13}}>SAVE VARIATION</button>
      </div>)}
      <div className="table-wrap" style={{marginBottom:16}}>
        <table><thead><tr><th>Date</th><th>Description</th><th>Reason</th><th>Cost</th><th>Status</th><th></th></tr></thead>
        <tbody>{variations.map(v=>(<tr key={v.id}>
          <td style={{color:"#555",whiteSpace:"nowrap"}}>{v.date}</td>
          <td style={{color:"#f0ede8"}}>{v.description}</td>
          <td style={{color:"#555"}}>{v.reason}</td>
          <td style={{color:"#e8a020",fontWeight:600}}>£{v.cost.toLocaleString()}</td>
          <td><span style={{fontSize:10,color:statusColours[v.status],border:`1px solid ${statusColours[v.status]}`,padding:"2px 8px",borderRadius:10,whiteSpace:"nowrap"}}>{v.status}</span></td>
          <td><button className="btn-danger" onClick={()=>setVariations(x=>x.filter(q=>q.id!==v.id))}>✕</button></td>
        </tr>))}</tbody></table>
      </div>
      <button className="btn" onClick={generateFinalAccount} disabled={loading}>{loading?"GENERATING...":"GENERATE FINAL ACCOUNT LETTER"}</button>
      {loading&&<div className="loading"><div className="spin"/>Writing your final account...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Final Account Letter</span><OutputActions title="Variation Final Account" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── Standing Time Calculator ──────────────────────────────────────────────────
function StandingTimeCalc({trade, profile, logo, onSave, favourites, toggleFav}) {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({date:"",reason:"",workers:"1",hours:"",rate:"",supervisor:""});
  const [showForm, setShowForm] = useState(false);
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const add = () => {
    if(!form.reason||!form.hours)return;
    const cost = (parseFloat(form.workers)||1)*(parseFloat(form.hours)||0)*(parseFloat(form.rate)||0);
    setEntries(e=>[...e,{...form,id:Date.now(),workers:parseInt(form.workers)||1,hours:parseFloat(form.hours)||0,rate:parseFloat(form.rate)||0,cost}]);
    setForm({date:"",reason:"",workers:"1",hours:"",rate:"",supervisor:""});
    setShowForm(false);
  };
  const totalCost = entries.reduce((s,e)=>s+e.cost,0);
  const totalHours = entries.reduce((s,e)=>s+(e.workers*e.hours),0);
  const generate = async () => {
    if(!entries.length)return;
    setLoading(true); setOutput("");
    const list = entries.map(e=>`${e.date}: ${e.reason} — ${e.workers} workers x ${e.hours} hours @ £${e.rate}/hr = £${e.cost.toFixed(2)} — Supervised by: ${e.supervisor||"[Name]"}`).join("\n");
    const p = `Write a formal standing time claim letter for a ${trade} subcontractor.\nCompany: ${profile.company||"[Company]"}\nTotal standing time cost: £${totalCost.toFixed(2)}, Total man hours lost: ${totalHours}\nStanding time entries:\n${list}\nWrite a professional claim letter that formally notifies the contractor of standing time incurred, references each occurrence with date, cause and cost, states the total amount claimed, requests payment within 14 days and references the right to claim under the subcontract. Firm, professional and legally referenced.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Error — try again.");}setLoading(false);
  };
  return(
    <div>
      <div className="tool-header">
        <div className="tool-title">Standing Time Calculator</div>
        <div style={{display:"flex",gap:6}}><FavButton toolId="standingtime" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="standingtime"/></div>
      </div>
      <div className="tool-sub">Log delays, calculate the cost and claim it back formally</div>
      <div className="dashboard-grid">
        <div className="dash-card"><div className="dash-num" style={{color:"#e8a020"}}>£{totalCost.toFixed(2)}</div><div className="dash-label">Total Claimable</div></div>
        <div className="dash-card"><div className="dash-num">{totalHours}</div><div className="dash-label">Man Hours Lost</div></div>
        <div className="dash-card"><div className="dash-num">{entries.length}</div><div className="dash-label">Occurrences</div></div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button className="btn-sm" onClick={()=>setShowForm(!showForm)}>+ Log Standing Time</button></div>
      {showForm&&(<div className="card">
        <div className="row2"><div><div className="fl">Date</div><input className="fi" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div><div><div className="fl">Number of Workers</div><input className="fi" placeholder="e.g. 3" value={form.workers} onChange={e=>setForm({...form,workers:e.target.value})}/></div></div>
        <div className="fl">Reason for Standing</div><input className="fi" placeholder="e.g. No access to level 3 — other trade still working" value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/>
        <div className="row2"><div><div className="fl">Hours Lost</div><input className="fi" placeholder="e.g. 4" value={form.hours} onChange={e=>setForm({...form,hours:e.target.value})}/></div><div><div className="fl">Hourly Rate Per Worker (£)</div><input className="fi" placeholder="e.g. 28" value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})}/></div></div>
        <div className="fl">Confirmed By (Site Supervisor)</div><input className="fi" placeholder="e.g. J. Williams, Site Manager" value={form.supervisor} onChange={e=>setForm({...form,supervisor:e.target.value})}/>
        {form.workers&&form.hours&&form.rate&&(<div className="cis-result" style={{marginBottom:12}}>
          <div className="cis-row"><span className="cis-label">{form.workers} workers × {form.hours} hrs × £{form.rate}/hr</span><span style={{color:"#4caf50",fontWeight:600}}>£{((parseFloat(form.workers)||0)*(parseFloat(form.hours)||0)*(parseFloat(form.rate)||0)).toFixed(2)}</span></div>
        </div>)}
        <button className="btn-sm" onClick={add} style={{width:"100%",padding:"10px",fontSize:13}}>SAVE ENTRY</button>
      </div>)}
      {entries.length>0&&(<>
        <div className="table-wrap" style={{marginBottom:16}}>
          <table><thead><tr><th>Date</th><th>Reason</th><th>Workers</th><th>Hours</th><th>Cost</th><th></th></tr></thead>
          <tbody>{entries.map(e=>(<tr key={e.id}>
            <td style={{color:"#555",whiteSpace:"nowrap"}}>{e.date}</td>
            <td style={{color:"#f0ede8"}}>{e.reason}</td>
            <td style={{textAlign:"center"}}>{e.workers}</td>
            <td style={{textAlign:"center"}}>{e.hours}</td>
            <td style={{color:"#e8a020",fontWeight:600}}>£{e.cost.toFixed(2)}</td>
            <td><button className="btn-danger" onClick={()=>setEntries(x=>x.filter(q=>q.id!==e.id))}>✕</button></td>
          </tr>))}</tbody></table>
        </div>
        <button className="btn" onClick={generate} disabled={loading}>{loading?"GENERATING...":"GENERATE STANDING TIME CLAIM"}</button>
      </>)}
      {entries.length===0&&<div className="hist-empty">No standing time logged yet. Log your first occurrence above.</div>}
      {loading&&<div className="loading"><div className="spin"/>Writing your standing time claim...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Standing Time Claim</span><OutputActions title="Standing Time Claim" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── Price Work Profit Calculator ──────────────────────────────────────────────
function PWProfitCalc({trade, favourites, toggleFav}) {
  const [job, setJob] = useState({name:"", contractor:"", zone:"", price:"", startDate:""});
  const [labourEntries, setLabourEntries] = useState([]);
  const [materialEntries, setMaterialEntries] = useState([]);
  const [labourForm, setLabourForm] = useState({date:"",description:"",workers:"1",hours:"",rate:""});
  const [matForm, setMatForm] = useState({date:"",description:"",cost:""});
  const [showLabour, setShowLabour] = useState(false);
  const [showMat, setShowMat] = useState(false);
  const price = parseFloat(job.price)||0;
  const totalLabour = labourEntries.reduce((s,e)=>s+e.cost,0);
  const totalMaterials = materialEntries.reduce((s,e)=>s+(parseFloat(e.cost)||0),0);
  const totalCosts = totalLabour + totalMaterials;
  const profit = price - totalCosts;
  const margin = price>0?((profit/price)*100).toFixed(1):0;
  const addLabour = () => {
    if(!labourForm.description||!labourForm.hours)return;
    const cost=(parseInt(labourForm.workers)||1)*(parseFloat(labourForm.hours)||0)*(parseFloat(labourForm.rate)||0);
    setLabourEntries(e=>[...e,{...labourForm,id:Date.now(),cost}]);
    setLabourForm({date:"",description:"",workers:"1",hours:"",rate:""});
    setShowLabour(false);
  };
  const addMat = () => {
    if(!matForm.description||!matForm.cost)return;
    setMaterialEntries(e=>[...e,{...matForm,id:Date.now()}]);
    setMatForm({date:"",description:"",cost:""});
    setShowMat(false);
  };
  const profitColor = profit>0?"#4caf50":profit<0?"#e05050":"#888";
  return(
    <div>
      <div className="tool-header">
        <div className="tool-title">PW Profit Calculator</div>
        <div style={{display:"flex",gap:6}}><FavButton toolId="pwprofit" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="pwprofit"/></div>
      </div>
      <div className="tool-sub">Track costs against your fixed price in real time</div>
      <div className="card">
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:12,letterSpacing:1}}>JOB DETAILS</div>
        <div className="row2"><div><div className="fl">Job / Zone Name</div><input className="fi" placeholder="e.g. Level 3 North Wing" value={job.name} onChange={e=>setJob({...job,name:e.target.value})}/></div><div><div className="fl">Fixed Price (£)</div><input className="fi" placeholder="e.g. 12,500" value={job.price} onChange={e=>setJob({...job,price:e.target.value})}/></div></div>
        <div className="row2"><div><div className="fl">Contractor</div><input className="fi" placeholder="e.g. IDSL" value={job.contractor} onChange={e=>setJob({...job,contractor:e.target.value})}/></div><div><div className="fl">Start Date</div><input className="fi" type="date" value={job.startDate} onChange={e=>setJob({...job,startDate:e.target.value})}/></div></div>
      </div>
      {price>0&&(<div className="dashboard-grid" style={{marginBottom:16}}>
        <div className="dash-card"><div className="dash-num">£{price.toLocaleString()}</div><div className="dash-label">Fixed Price</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:"#e05050"}}>£{totalCosts.toLocaleString()}</div><div className="dash-label">Total Costs</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:profitColor}}>£{Math.abs(profit).toLocaleString()}</div><div className="dash-label">{profit>=0?"Profit":"Loss"}</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:profitColor}}>{margin}%</div><div className="dash-label">Margin</div></div>
      </div>)}
      {price>0&&(<div style={{background:"#0d0d0d",border:"1px solid #1a1a1a",borderRadius:8,padding:12,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:11,color:"#555"}}>Cost Progress</span><span style={{fontSize:11,color:profitColor}}>{price>0?((totalCosts/price)*100).toFixed(0):0}% of price used</span></div>
        <div style={{height:8,background:"#1a1a1a",borderRadius:4,overflow:"hidden"}}>
          <div style={{height:"100%",background:totalCosts/price>0.9?"#e05050":totalCosts/price>0.7?"#e8a020":"#4caf50",width:`${Math.min((totalCosts/price)*100,100)}%`,borderRadius:4,transition:"width .3s"}}/>
        </div>
      </div>)}
      <div style={{display:"flex",gap:10,marginBottom:12}}>
        <button className="btn-sm" onClick={()=>{setShowLabour(!showLabour);setShowMat(false);}}>+ Labour</button>
        <button className="btn-sm" onClick={()=>{setShowMat(!showMat);setShowLabour(false);}}>+ Materials</button>
      </div>
      {showLabour&&(<div className="card">
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:12,letterSpacing:1}}>ADD LABOUR COST</div>
        <div className="row2"><div><div className="fl">Date</div><input className="fi" type="date" value={labourForm.date} onChange={e=>setLabourForm({...labourForm,date:e.target.value})}/></div><div><div className="fl">Description</div><input className="fi" placeholder="e.g. Duct installation level 3" value={labourForm.description} onChange={e=>setLabourForm({...labourForm,description:e.target.value})}/></div></div>
        <div className="row2"><div><div className="fl">Workers</div><input className="fi" placeholder="e.g. 2" value={labourForm.workers} onChange={e=>setLabourForm({...labourForm,workers:e.target.value})}/></div><div><div className="fl">Hours</div><input className="fi" placeholder="e.g. 8" value={labourForm.hours} onChange={e=>setLabourForm({...labourForm,hours:e.target.value})}/></div></div>
        <div className="fl">Rate per Worker (£/hr)</div><input className="fi" placeholder="e.g. 28" value={labourForm.rate} onChange={e=>setLabourForm({...labourForm,rate:e.target.value})}/>
        <button className="btn-sm" onClick={addLabour} style={{width:"100%",padding:"10px",fontSize:13}}>SAVE LABOUR</button>
      </div>)}
      {showMat&&(<div className="card">
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:12,letterSpacing:1}}>ADD MATERIAL COST</div>
        <div className="row2"><div><div className="fl">Date</div><input className="fi" type="date" value={matForm.date} onChange={e=>setMatForm({...matForm,date:e.target.value})}/></div><div><div className="fl">Description</div><input className="fi" placeholder="e.g. 600x400 ductwork 3m lengths x10" value={matForm.description} onChange={e=>setMatForm({...matForm,description:e.target.value})}/></div></div>
        <div className="fl">Cost (£)</div><input className="fi" placeholder="e.g. 380" value={matForm.cost} onChange={e=>setMatForm({...matForm,cost:e.target.value})}/>
        <button className="btn-sm" onClick={addMat} style={{width:"100%",padding:"10px",fontSize:13}}>SAVE MATERIALS</button>
      </div>)}
      {(labourEntries.length>0||materialEntries.length>0)&&(<div className="card">
        {labourEntries.length>0&&(<><div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:8,letterSpacing:1}}>LABOUR — £{totalLabour.toLocaleString()}</div>
        {labourEntries.map(e=>(<div key={e.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #1a1a1a",fontSize:12}}>
          <span style={{color:"#aaa"}}>{e.description}</span><span style={{color:"#e05050"}}>£{e.cost.toFixed(2)}</span>
        </div>))}</>)}
        {materialEntries.length>0&&(<><div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:8,marginTop:12,letterSpacing:1}}>MATERIALS — £{totalMaterials.toLocaleString()}</div>
        {materialEntries.map(e=>(<div key={e.id} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #1a1a1a",fontSize:12}}>
          <span style={{color:"#aaa"}}>{e.description}</span><span style={{color:"#e05050"}}>£{parseFloat(e.cost).toFixed(2)}</span>
        </div>))}</>)}
      </div>)}
    </div>
  );
}

// ── Offline Mode ──────────────────────────────────────────────────────────────
function OfflineMode({profile, favourites, navigateTo}) {
  const [savedDrafts, setSavedDrafts] = useState(() => {
    try { return JSON.parse(localStorage.getItem("morris_offline_drafts")||"[]"); } catch { return []; }
  });
  const [newDraft, setNewDraft] = useState({title:"", content:"", tool:""});
  const [showForm, setShowForm] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useState(()=>{
    const on=()=>setIsOnline(true); const off=()=>setIsOnline(false);
    window.addEventListener("online",on); window.addEventListener("offline",off);
    return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);};
  },[]);
  const saveDraft = () => {
    if(!newDraft.title)return;
    const drafts=[...savedDrafts,{...newDraft,id:Date.now(),date:new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}];
    setSavedDrafts(drafts);
    try{localStorage.setItem("morris_offline_drafts",JSON.stringify(drafts));}catch{}
    setNewDraft({title:"",content:"",tool:""});
    setShowForm(false);
  };
  const deleteDraft = (id) => {
    const drafts=savedDrafts.filter(d=>d.id!==id);
    setSavedDrafts(drafts);
    try{localStorage.setItem("morris_offline_drafts",JSON.stringify(drafts));}catch{}
  };
  const favTools = favourites.map(id=>TOOLS.find(t=>t.id===id)).filter(Boolean);
  return(
    <div>
      <div className="tool-header">
        <div className="tool-title">Offline Mode</div>
        <InfoButton toolId="offline"/>
      </div>
      <div className="tool-sub">Save notes and drafts for use on site with no signal</div>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",background:"#141414",border:"1px solid #1e1e1e",borderRadius:8,marginBottom:16}}>
        <div style={{width:10,height:10,borderRadius:"50%",background:isOnline?"#4caf50":"#e05050",flexShrink:0}}/>
        <span style={{fontSize:13,color:isOnline?"#4caf50":"#e05050",fontWeight:500}}>{isOnline?"You're online — all features available":"You're offline — saved drafts available below"}</span>
      </div>
      {favTools.length>0&&(<div className="card" style={{marginBottom:16}}>
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:12,letterSpacing:1}}>★ YOUR FAVOURITE TOOLS — QUICK ACCESS</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {favTools.map(t=>(<div key={t.id} onClick={()=>navigateTo(t.id)} style={{padding:"10px 12px",background:"#0d0d0d",border:"1px solid #222",borderRadius:6,cursor:"pointer",display:"flex",alignItems:"center",gap:8,transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor="#e8a020"} onMouseLeave={e=>e.currentTarget.style.borderColor="#222"}>
            <span>{t.icon}</span><span style={{fontSize:12,color:"#aaa"}}>{t.label}</span>
          </div>))}
        </div>
      </div>)}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:11,color:"#555",letterSpacing:1,textTransform:"uppercase"}}>Saved Drafts ({savedDrafts.length})</div>
        <button className="btn-sm" onClick={()=>setShowForm(!showForm)}>+ Save Draft</button>
      </div>
      {showForm&&(<div className="card">
        <div className="fl">Draft Title</div><input className="fi" placeholder="e.g. Level 3 variation notes" value={newDraft.title} onChange={e=>setNewDraft({...newDraft,title:e.target.value})}/>
        <div className="fl">Tool / Document Type</div><input className="fi" placeholder="e.g. Variation Letter, Site Diary..." value={newDraft.tool} onChange={e=>setNewDraft({...newDraft,tool:e.target.value})}/>
        <div className="fl">Notes / Draft Content</div>
        <textarea className="fi" style={{minHeight:100}} placeholder="Save your notes, measurements, details or partial document content here..." value={newDraft.content} onChange={e=>setNewDraft({...newDraft,content:e.target.value})}/>
        <button className="btn-sm" onClick={saveDraft} style={{width:"100%",padding:"10px",fontSize:13}}>SAVE OFFLINE DRAFT</button>
      </div>)}
      {savedDrafts.length===0&&!showForm&&(<div className="hist-empty">No drafts saved yet. Save notes or partial documents here to access on site with no signal.</div>)}
      {savedDrafts.map(d=>(<div key={d.id} className="card" style={{marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
          <div><div style={{fontSize:13,fontWeight:500,color:"#f0ede8",marginBottom:2}}>{d.title}</div><div style={{fontSize:10,color:"#555"}}>{d.tool&&`${d.tool} · `}{d.date}</div></div>
          <button className="btn-danger" onClick={()=>deleteDraft(d.id)}>✕</button>
        </div>
        {d.content&&<div style={{fontSize:12,color:"#888",lineHeight:1.6,whiteSpace:"pre-wrap",borderTop:"1px solid #1a1a1a",paddingTop:8}}>{d.content}</div>}
      </div>))}
      <div className="info-box" style={{marginTop:16}}><strong>How offline mode works:</strong> Drafts are saved to your device. They stay available even with no internet. Document generation needs a connection — use this tool to save your notes and details on site, then generate the full document when you're back online.</div>
    </div>
  );
}

// ── Verbal → Variation (Wow Feature 1) ───────────────────────────────────────
function VerbalVariation({trade, profile, logo, onSave, favourites, toggleFav}) {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1=record, 2=review, 3=done
  const recognitionRef = React.useRef(null);

  const startRecording = () => {
    if(!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)){
      alert("Speech recognition not supported on this browser. Try Chrome.");
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-GB';
    recognition.onresult = (e) => {
      const t = Array.from(e.results).map(r=>r[0].transcript).join(' ');
      setTranscript(t);
    };
    recognition.start();
    recognitionRef.current = recognition;
    setRecording(true);
  };

  const stopRecording = () => {
    if(recognitionRef.current) recognitionRef.current.stop();
    setRecording(false);
    setStep(2);
  };

  const generateVariation = async () => {
    setLoading(true); setOutput("");
    const p = `Convert this verbal instruction recorded on site into a professional formal variation letter.\nTrade: ${trade}, Company: ${profile.company||"[Company]"}, Name: ${profile.name||"[Name]"}\nVerbal instruction recorded: "${transcript}"\nGenerate a complete formal variation letter that: references the verbal instruction, describes the extra works, states the date, requests written confirmation and approval, includes a cost to be agreed or estimated if mentioned. Professional, formal, ready to send immediately.`;
    try{setOutput(await callMorris(p)); setStep(3);}catch{setOutput("Error — try again.");}
    setLoading(false);
  };

  return(
    <div>
      <div className="tool-header">
        <div className="tool-title">Verbal → Variation</div>
        <div style={{display:"flex",gap:6}}><FavButton toolId="verbvariation" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="verbvariation"/></div>
      </div>
      <div className="tool-sub">Speak on site — Morris writes the variation letter — send it before they walk away</div>
      <div className="info-box"><strong>How it works:</strong> Press Record when a site manager gives you a verbal instruction. Speak naturally describing what they asked you to do. Stop recording. Morris converts it into a formal variation letter in seconds.</div>

      {step===1&&(
        <div style={{textAlign:"center",padding:"40px 20px"}}>
          <div style={{fontSize:64,marginBottom:24}}>{recording?"🔴":"🎙️"}</div>
          <div style={{fontSize:14,color:"#aaa",marginBottom:32}}>{recording?"Recording... speak clearly about the instruction you received":"Press record when the site manager gives you a verbal instruction"}</div>
          {!recording?(
            <button onClick={startRecording} style={{background:"linear-gradient(135deg,#e8a020,#c8780a)",border:"none",borderRadius:50,width:80,height:80,fontSize:28,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",boxShadow:"0 8px 32px rgba(232,160,32,.3)"}}>🎙️</button>
          ):(
            <div>
              <div style={{display:"flex",gap:4,justifyContent:"center",marginBottom:24}}>
                {[...Array(5)].map((_,i)=><div key={i} style={{width:4,borderRadius:2,background:"#e8a020",animation:`wave ${0.5+i*0.1}s ease infinite alternate`,height:20+Math.random()*20}}/>)}
              </div>
              <button onClick={stopRecording} style={{background:"#e05050",border:"none",borderRadius:50,width:80,height:80,fontSize:28,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",boxShadow:"0 8px 32px rgba(224,80,80,.3)"}}>⏹️</button>
              <div style={{marginTop:16,fontSize:12,color:"#666"}}>Press stop when done speaking</div>
            </div>
          )}
          {transcript&&<div style={{marginTop:24,background:"#0d0d0d",border:"1px solid #1a1a1a",borderRadius:8,padding:16,fontSize:13,color:"#aaa",textAlign:"left",lineHeight:1.6}}>{transcript}</div>}
        </div>
      )}

      {step===2&&(
        <div>
          <div className="card">
            <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:8,letterSpacing:1}}>WHAT YOU SAID — EDIT IF NEEDED</div>
            <textarea className="fi" style={{minHeight:120,fontSize:13}} value={transcript} onChange={e=>setTranscript(e.target.value)}/>
            <div style={{display:"flex",gap:10}}>
              <button className="btn-sm" onClick={()=>{setStep(1);setTranscript("");}}>Re-record</button>
              <button className="btn" onClick={generateVariation} disabled={loading||!transcript} style={{flex:1}}>{loading?"GENERATING...":"GENERATE VARIATION LETTER ⚡"}</button>
            </div>
          </div>
          {loading&&<div className="loading"><div className="spin"/>Converting to variation letter...</div>}
        </div>
      )}

      {step===3&&output&&(
        <div>
          <div className="output-box">
            <div className="out-head">
              <span className="out-label">Variation Letter — Generated in seconds ⚡</span>
              <OutputActions title="Variation Letter" output={output} profile={profile} logo={logo} onSave={onSave}/>
            </div>
            {output}
          </div>
          <button className="btn-sm" onClick={()=>{setStep(1);setTranscript("");setOutput("");}} style={{marginTop:12,width:"100%"}}>Record Another</button>
        </div>
      )}
    </div>
  );
}

// ── Photo to Document (Wow Feature 2) ─────────────────────────────────────────
function PhotoToDoc({trade, profile, logo, onSave, favourites, toggleFav}) {
  const [image, setImage] = useState(null);
  const [docType, setDocType] = useState("auto");
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const docTypes = ["auto","Variation Letter","Notification of Defect","Delivery Record","Incident Report","Daywork Sheet","Site Diary Entry","Verbal Instruction Record"];

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(file);
  };

  const generate = async () => {
    if(!image){alert("Please take or upload a photo first");return;}
    setLoading(true); setOutput("");
    const typeInstruction = docType==="auto" ? "Identify what type of construction document this should become and generate the appropriate formal document." : `Generate a formal ${docType} based on this photo.`;
    const p = `You are looking at a photo from a UK construction site. ${typeInstruction}\nTrade: ${trade}, Company: ${profile.company||"[Company]"}\nThe photo may show: handwritten notes, delivery notes, damaged materials, site conditions, verbal instructions, daywork records, or other site documentation.\nGenerate a complete professional formal document based on what you can identify. Include all relevant details, dates, references and signature blocks. Make it ready to send immediately.`;
    try{
      const response = await fetch("/api/generate", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({prompt: p, image: image})
      });
      const d = await response.json();
      setOutput(d.text||"Error — try again.");
    }catch{setOutput("Error — try again.");}
    setLoading(false);
  };

  return(
    <div>
      <div className="tool-header">
        <div className="tool-title">Photo to Document</div>
        <div style={{display:"flex",gap:6}}><FavButton toolId="phototodoc" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="phototodoc"/></div>
      </div>
      <div className="tool-sub">Take a photo on site — Morris converts it into a formal document</div>
      <div className="card">
        <div className="fl">Document Type</div>
        <select className="fi" value={docType} onChange={e=>setDocType(e.target.value)} style={{cursor:"pointer",marginBottom:16}}>
          {docTypes.map(t=><option key={t}>{t==="auto"?"🔮 Auto-detect (Morris decides)":t}</option>)}
        </select>
        <div className="fl">Photo</div>
        <label style={{display:"block",border:"2px dashed rgba(232,160,32,.3)",borderRadius:8,padding:24,textAlign:"center",cursor:"pointer",marginBottom:16,transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(232,160,32,.6)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(232,160,32,.3)"}>
          {image?(
            <img src={image} style={{maxWidth:"100%",maxHeight:200,borderRadius:6,objectFit:"contain"}} alt="Site photo"/>
          ):(
            <div>
              <div style={{fontSize:40,marginBottom:8}}>📸</div>
              <div style={{fontSize:13,color:"#666"}}>Tap to take photo or upload from gallery</div>
              <div style={{fontSize:11,color:"#444",marginTop:4}}>Handwritten notes, delivery docs, site conditions...</div>
            </div>
          )}
          <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{display:"none"}}/>
        </label>
        {image&&<button className="btn-sm" onClick={()=>setImage(null)} style={{marginBottom:12,width:"100%"}}>Remove Photo</button>}
        <button className="btn" onClick={generate} disabled={loading||!image}>{loading?"READING PHOTO...":"CONVERT PHOTO TO DOCUMENT 📸✨"}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Reading your photo and generating document...</div>}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Document from Photo</span><OutputActions title="Site Document" output={output} profile={profile} logo={logo} onSave={onSave}/></div>{output}</div>)}
    </div>
  );
}

// ── Contract Red Flag Scanner (Wow Feature 3) ─────────────────────────────────
function ContractScanner({trade, profile, logo, onSave, favourites, toggleFav}) {
  const [contract, setContract] = useState("");
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const [flags, setFlags] = useState([]);

  const scan = async () => {
    if(!contract.trim()){alert("Paste your contract text first");return;}
    setLoading(true); setOutput(""); setFlags([]);
    const p = `You are a construction law expert reviewing a subcontract for a ${trade} sole trader in the UK.\nReview this subcontract and produce a traffic light risk report:\n\n${contract}\n\nFormat your response as:\n🟢 GREEN - SAFE CLAUSES: List clauses that are standard and acceptable\n🟡 AMBER - WATCH OUT: List clauses that need attention with plain English explanation\n🔴 RED - DANGER: List clauses that are seriously unfair or dangerous with exact explanation of the risk and what to say to get them changed\n\nThen provide: OVERALL RISK SCORE out of 10 (10 = very risky), KEY NEGOTIATION POINTS (top 3 things to push back on), RECOMMENDED ACTIONS before signing.\n\nUse plain English. No legal jargon. Write as if explaining to a tradesperson on site.`;
    try{setOutput(await callMorris(p));}catch{setOutput("Error — try again.");}
    setLoading(false);
  };

  return(
    <div>
      <div className="tool-header">
        <div className="tool-title">Contract Scanner</div>
        <div style={{display:"flex",gap:6}}><FavButton toolId="contractscan" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="contractscan"/></div>
      </div>
      <div className="tool-sub">Paste your subcontract — Morris flags every dodgy clause in plain English</div>
      <div className="warn-box"><strong>Important:</strong> Morris highlights risks for your awareness. This is not legal advice. For contracts over £50,000 consider getting a solicitor to review before signing.</div>
      <div className="card">
        <div className="fl">Paste Your Contract Here</div>
        <textarea className="fi" style={{minHeight:200,fontSize:12,fontFamily:"monospace"}} placeholder="Paste the full text of your subcontract here. You can copy it from a PDF or email..." value={contract} onChange={e=>setContract(e.target.value)}/>
        <div style={{fontSize:11,color:"#555",marginBottom:12}}>{contract.length} characters — {Math.round(contract.split(' ').length)} words</div>
        <button className="btn" onClick={scan} disabled={loading||!contract.trim()}>{loading?"SCANNING CONTRACT...":"SCAN FOR RED FLAGS 🚦"}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Reading your contract and identifying risks...</div>}
      {output&&!loading&&(
        <div className="output-box">
          <div className="out-head">
            <span className="out-label">Contract Risk Report</span>
            <OutputActions title="Contract Risk Report" output={output} profile={profile} logo={logo} onSave={onSave}/>
          </div>
          <div style={{whiteSpace:"pre-wrap",fontSize:13,lineHeight:1.7}}>
            {output.split('\n').map((line,i)=>(
              <div key={i} style={{
                padding: line.startsWith('🔴')||line.startsWith('🟡')||line.startsWith('🟢') ? "8px 12px" : "2px 0",
                background: line.startsWith('🔴') ? "rgba(224,80,80,.06)" : line.startsWith('🟡') ? "rgba(232,160,32,.06)" : line.startsWith('🟢') ? "rgba(76,175,80,.06)" : "transparent",
                borderLeft: line.startsWith('🔴') ? "3px solid #e05050" : line.startsWith('🟡') ? "3px solid #e8a020" : line.startsWith('🟢') ? "3px solid #4caf50" : "none",
                borderRadius: 4,
                marginBottom: line.startsWith('🔴')||line.startsWith('🟡')||line.startsWith('🟢') ? 6 : 0,
              }}>{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Payment Probability Score (Wow Feature 4) ─────────────────────────────────
function PayPredict({trade, favourites, toggleFav}) {
  const [contractor, setContractor] = useState("");
  const [output, setOutput] = useState(""); const [loading, setLoading] = useState(false);
  const [score, setScore] = useState(null);

  const check = async () => {
    if(!contractor.trim()){alert("Enter a contractor name");return;}
    setLoading(true); setOutput(""); setScore(null);
    const p = `You are a construction industry payment risk analyst.\nA ${trade} subcontractor wants to know the payment risk of working for: "${contractor}"\n\nBased on general knowledge of UK construction industry payment practices, company types, and risk factors, provide:\n1. PAYMENT PROBABILITY SCORE: X/10 (10 = excellent payer, 1 = very high risk)\n2. RISK LEVEL: Green / Amber / Red\n3. WHAT TO LOOK FOR: 3 specific things to check before starting (Companies House, reviews, contract terms)\n4. PROTECTIVE MEASURES: What documents and protections to have in place before starting\n5. RED FLAGS TO WATCH: Warning signs during the job\n6. RECOMMENDED ACTIONS: Whether to proceed and on what terms\n\nNote: This is based on general industry knowledge, not specific company data. Always do your own due diligence. Be helpful and practical.`;
    try{
      const result = await callMorris(p);
      setOutput(result);
      const scoreMatch = result.match(/(\d+)\/10/);
      if(scoreMatch) setScore(parseInt(scoreMatch[1]));
    }catch{setOutput("Error — try again.");}
    setLoading(false);
  };

  const scoreColor = score ? (score>=7?"#4caf50":score>=4?"#e8a020":"#e05050") : "#888";
  const scoreLabel = score ? (score>=7?"Good Payer":score>=4?"Proceed withCaution":"High Risk — protect yourself") : "";

  return(
    <div>
      <div className="tool-header">
        <div className="tool-title">Pay Probability</div>
        <div style={{display:"flex",gap:6}}><FavButton toolId="paypredict" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="paypredict"/></div>
      </div>
      <div className="tool-sub">Check a contractor before you start work — know your payment risk</div>
      <div className="info-box"><strong>Check before you start:</strong> Enter the contractor's name and Morris assesses the payment risk based on industry knowledge. Always do your own checks on Companies House too.</div>
      <div className="card">
        <div className="fl">Contractor / Company Name</div>
        <input className="fi" placeholder="e.g. Imperial Ductwork Services Ltd" value={contractor} onChange={e=>setContractor(e.target.value)}/>
        <button className="btn" onClick={check} disabled={loading||!contractor.trim()}>{loading?"CHECKING...":"CHECK PAYMENT RISK 🔮"}</button>
      </div>
      {loading&&<div className="loading"><div className="spin"/>Assessing payment risk...</div>}
      {score&&!loading&&(
        <div style={{textAlign:"center",padding:"24px",background:"#0d0d0d",border:`2px solid ${scoreColor}`,borderRadius:12,marginBottom:16}}>
          <div style={{fontSize:64,fontFamily:"'Bebas Neue',sans-serif",color:scoreColor,lineHeight:1}}>{score}/10</div>
          <div style={{fontSize:14,color:scoreColor,fontWeight:600,marginTop:4}}>{scoreLabel}</div>
          <div style={{fontSize:11,color:"#555",marginTop:8}}>{contractor}</div>
        </div>
      )}
      {output&&!loading&&(<div className="output-box"><div className="out-head"><span className="out-label">Payment Risk Report — {contractor}</span></div><div style={{whiteSpace:"pre-wrap",fontSize:13,lineHeight:1.7}}>{output}</div></div>)}
    </div>
  );
}

// ── CIS Refund Predictor (Wow Feature 5) ──────────────────────────────────────
function CISPredict({favourites, toggleFav}) {
  const [payments, setPayments] = useState([]);
  const [form, setForm] = useState({date:"",contractor:"",gross:"",rate:"20"});
  const [showForm, setShowForm] = useState(false);
  const [expenses, setExpenses] = useState("0");

  const add = () => {
    if(!form.gross)return;
    const gross=parseFloat(form.gross)||0;
    const deduction=gross*(parseFloat(form.rate)/100);
    setPayments(p=>[...p,{...form,id:Date.now(),gross,deduction,net:gross-deduction}]);
    setForm({date:"",contractor:"",gross:"",rate:"20"});
    setShowForm(false);
  };

  const totalGross = payments.reduce((s,p)=>s+p.gross,0);
  const totalDeducted = payments.reduce((s,p)=>s+p.deduction,0);
  const totalExpenses = parseFloat(expenses)||0;
  const taxableIncome = Math.max(0, totalGross - totalExpenses - 12570); // minus personal allowance
  const actualTaxDue = taxableIncome <= 37700 ? taxableIncome * 0.20 : 37700*0.20 + (taxableIncome-37700)*0.40;
  const estimatedRefund = Math.max(0, totalDeducted - actualTaxDue);
  const estimatedOwed = Math.max(0, actualTaxDue - totalDeducted);

  return(
    <div>
      <div className="tool-header">
        <div className="tool-title">CIS Refund Predictor</div>
        <div style={{display:"flex",gap:6}}><FavButton toolId="cispredict" favourites={favourites} toggleFav={toggleFav}/><InfoButton toolId="cispredict"/></div>
      </div>
      <div className="tool-sub">See exactly how much HMRC owes you — updated in real time</div>
      <div className="dashboard-grid">
        <div className="dash-card"><div className="dash-num">£{totalGross.toLocaleString()}</div><div className="dash-label">Total Gross Earnings</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:"#e05050"}}>£{totalDeducted.toLocaleString()}</div><div className="dash-label">Total CIS Deducted</div></div>
        <div className="dash-card"><div className="dash-num" style={{color:estimatedRefund>0?"#4caf50":"#e05050"}}>£{Math.round(estimatedRefund>0?estimatedRefund:estimatedOwed).toLocaleString()}</div><div className="dash-label">{estimatedRefund>0?"Estimated Refund 🎉":"Estimated Tax Owed"}</div></div>
        <div className="dash-card"><div className="dash-num">{payments.length}</div><div className="dash-label">Payments Logged</div></div>
      </div>
      {estimatedRefund>0&&totalGross>0&&(
        <div style={{background:"rgba(76,175,80,.08)",border:"1px solid rgba(76,175,80,.25)",borderRadius:8,padding:16,marginBottom:16,textAlign:"center"}}>
          <div style={{fontSize:28,marginBottom:4}}>🎉</div>
          <div style={{fontSize:16,color:"#4caf50",fontWeight:600}}>HMRC owes you approximately £{Math.round(estimatedRefund).toLocaleString()}</div>
          <div style={{fontSize:12,color:"#888",marginTop:4}}>Based on your logged payments and expenses — claim this back through self assessment</div>
        </div>
      )}
      <div className="card" style={{marginBottom:12}}>
        <div className="fl">Business Expenses This Year (£)</div>
        <input className="fi" placeholder="e.g. 3500 — tools, materials, van, workwear..." value={expenses} onChange={e=>setExpenses(e.target.value)}/>
        <div style={{fontSize:11,color:"#555"}}>Expenses reduce your taxable income and increase your refund</div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}><button className="btn-sm" onClick={()=>setShowForm(!showForm)}>+ Log CIS Payment</button></div>
      {showForm&&(<div className="card">
        <div className="row2"><div><div className="fl">Date</div><input className="fi" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div><div><div className="fl">Contractor</div><input className="fi" placeholder="e.g. IDSL" value={form.contractor} onChange={e=>setForm({...form,contractor:e.target.value})}/></div></div>
        <div className="row2"><div><div className="fl">Gross Payment (£)</div><input className="fi" placeholder="e.g. 2200" value={form.gross} onChange={e=>setForm({...form,gross:e.target.value})}/></div><div><div className="fl">Deduction Rate</div><select className="fi" value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})} style={{cursor:"pointer"}}><option value="20">20% Standard</option><option value="30">30% Higher</option><option value="0">0% Gross</option></select></div></div>
        <button className="btn-sm" onClick={add} style={{width:"100%",padding:"10px",fontSize:13}}>SAVE PAYMENT</button>
      </div>)}
      {payments.length>0&&(<div className="table-wrap"><table><thead><tr><th>Date</th><th>Contractor</th><th>Gross</th><th>Deducted</th><th>Net Paid</th></tr></thead>
      <tbody>{payments.map(p=>(<tr key={p.id}><td>{p.date}</td><td>{p.contractor}</td><td>£{p.gross.toLocaleString()}</td><td style={{color:"#e05050"}}>£{p.deduction.toFixed(2)}</td><td style={{color:"#4caf50"}}>£{p.net.toFixed(2)}</td></tr>))}</tbody></table></div>)}
      {payments.length===0&&<div className="hist-empty">No payments logged yet. Add your CIS payments above to see your refund prediction.</div>}
      <div className="warn-box" style={{marginTop:16}}><strong>Estimate only:</strong> This is based on standard tax rates and your logged figures. Your actual refund depends on your full tax position. Use a construction accountant for your actual self assessment.</div>
    </div>
  );
}

// ── Morris Score ──────────────────────────────────────────────────────────────
function MorrisScore({history, favourites, profile}) {
  const toolsUsed = [...new Set(history.map(h=>h.tool))].length;
  const profileComplete = profile.company&&profile.name&&profile.utr ? 3 : (profile.company||profile.name) ? 1 : 0;
  const favCount = favourites.length;
  const docCount = history.length;

  const score = Math.min(100, Math.round(
    (toolsUsed * 3) +
    (profileComplete * 10) +
    (favCount * 2) +
    (Math.min(docCount, 20) * 1.5)
  ));

  const level = score >= 80 ? "Elite" : score >= 60 ? "Professional" : score >= 40 ? "Developing" : score >= 20 ? "Getting Started" : "Beginner";
  const levelColor = score >= 80 ? "#e8a020" : score >= 60 ? "#4caf50" : score >= 40 ? "#2196f3" : score >= 20 ? "#9c27b0" : "#555";

  const milestones = [
    {label:"Complete your profile", done:profileComplete===3, points:30, action:"Go to My Profile"},
    {label:"Generate your first document", done:docCount>=1, points:5, action:"Try Variation Letter"},
    {label:"Use 5 different tools", done:toolsUsed>=5, points:15, action:"Explore the sidebar"},
    {label:"Use 10 different tools", done:toolsUsed>=10, points:15, action:"Keep exploring"},
    {label:"Save 10 documents", done:docCount>=10, points:15, action:"Generate more documents"},
    {label:"Add 3 favourites", done:favCount>=3, points:6, action:"Star your top tools"},
    {label:"Use 20 different tools", done:toolsUsed>=20, points:20, action:"Explore all sections"},
  ];

  return(
    <div>
      <div className="tool-header">
        <div className="tool-title">Morris Score</div>
        <InfoButton toolId="morrisscore"/>
      </div>
      <div className="tool-sub">Your commercial protection score — the higher the better</div>
      <div style={{textAlign:"center",padding:"32px 20px",background:"#0d0d0d",border:"1px solid rgba(232,160,32,.1)",borderRadius:12,marginBottom:20}}>
        <div style={{position:"relative",display:"inline-block",marginBottom:16}}>
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="60" fill="none" stroke="#1a1a1a" strokeWidth="12"/>
            <circle cx="70" cy="70" r="60" fill="none" stroke={levelColor} strokeWidth="12" strokeDasharray={`${(score/100)*377} 377`} strokeLinecap="round" transform="rotate(-90 70 70)" style={{transition:"stroke-dasharray 1s ease"}}/>
          </svg>
          <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center"}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:42,color:levelColor,lineHeight:1}}>{score}</div>
            <div style={{fontSize:10,color:"#555",letterSpacing:1}}>OUT OF 100</div>
          </div>
        </div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:24,color:levelColor,letterSpacing:3}}>{level}</div>
        <div style={{fontSize:12,color:"#555",marginTop:4}}>Morris Protection Level</div>
      </div>
      <div className="card">
        <div style={{fontSize:11,color:"#e8a020",fontWeight:600,marginBottom:16,letterSpacing:1}}>HOW TO INCREASE YOUR SCORE</div>
        {milestones.map((m,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid #141414"}}>
          <div style={{width:24,height:24,borderRadius:"50%",background:m.done?"rgba(76,175,80,.15)":"rgba(232,160,32,.08)",border:`1px solid ${m.done?"rgba(76,175,80,.3)":"rgba(232,160,32,.15)"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:12}}>{m.done?"✓":"○"}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:12,color:m.done?"#4caf50":"#aaa",textDecoration:m.done?"line-through":"none"}}>{m.label}</div>
            {!m.done&&<div style={{fontSize:10,color:"#555"}}>{m.action}</div>}
          </div>
          <div style={{fontSize:11,color:m.done?"#4caf50":"#555",flexShrink:0}}>+{m.points}pts</div>
        </div>))}
      </div>
      <div className="info-box"><strong>What your score means:</strong> A high Morris Score shows contractors and clients that you document everything professionally. Elite Morris users are the most commercially protected tradespeople in the UK.</div>
    </div>
  );
}

// ── Favourites Page ───────────────────────────────────────────────────────────
function FavouritesPage({favourites, navigateTo}) {
  const favTools = favourites.map(id=>TOOLS.find(t=>t.id===id)).filter(Boolean);
  return(
    <div>
      <div className="tool-header">
        <div className="tool-title">Favourites</div>
      </div>
      <div className="tool-sub">Your starred tools — tap any to open it</div>
      {favTools.length===0&&(
        <div style={{background:"#141414",border:"1px solid #1e1e1e",borderRadius:8,padding:40,textAlign:"center"}}>
          <div style={{fontSize:32,marginBottom:16}}>☆</div>
          <div style={{fontSize:14,color:"#666",marginBottom:8}}>No favourites yet</div>
          <div style={{fontSize:12,color:"#444",lineHeight:1.7}}>Open any tool and tap the ☆ star button at the top right to add it to your favourites. It will appear here instantly.</div>
        </div>
      )}
      {favTools.length>0&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
          {favTools.map(t=>(
            <div key={t.id} onClick={()=>navigateTo(t.id)} style={{background:"#141414",border:"1px solid rgba(232,160,32,.15)",borderRadius:8,padding:"20px 16px",cursor:"pointer",transition:"all .2s",display:"flex",flexDirection:"column",gap:8}} onMouseEnter={e=>{e.currentTarget.style.background="#1a1400";e.currentTarget.style.borderColor="rgba(232,160,32,.35)";}} onMouseLeave={e=>{e.currentTarget.style.background="#141414";e.currentTarget.style.borderColor="rgba(232,160,32,.15)";}}>
              <span style={{fontSize:24}}>{t.icon}</span>
              <div style={{fontSize:13,fontWeight:500,color:"#f0ede8"}}>{t.label}</div>
              <div style={{fontSize:10,color:"#555",letterSpacing:1,textTransform:"uppercase"}}>{t.section}</div>
              <div style={{fontSize:10,color:"#e8a020",marginTop:4}}>Open →</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
 }                                                                   
// ── App Shell ─────────────────────────────────────────────────────────────────
export default function Morris() {
  const [user, setUser] = useState(()=>{ try{return localStorage.getItem("morris_user")||null;}catch{return null;} });
  const handleLogin = (username) => { try{localStorage.setItem("morris_user",username);}catch{} setUser(username); };
  const handleLogout = () => { try{localStorage.removeItem("morris_user");}catch{} setUser(null); };
  const [active,setActive]=useState("variation");
  const [trade,setTrade]=useState(()=>{try{return localStorage.getItem("morris_trade")||"Duct Fitter";}catch{return "Duct Fitter";}});
  const [tempTrade,setTempTrade]=useState("Duct Fitter");
  const [showTradeModal,setShowTradeModal]=useState(false);
  const [history,setHistory]=useState(()=>{try{return JSON.parse(localStorage.getItem("morris_history")||"[]");}catch{return [];}});
  const [profile,setProfile]=useState(()=>{try{return JSON.parse(localStorage.getItem("morris_profile")||"null")||{name:"",company:"",utr:"",cis:"",phone:"",email:"",bankName:"",sortCode:"",accNum:""};}catch{return {name:"",company:"",utr:"",cis:"",phone:"",email:"",bankName:"",sortCode:"",accNum:""};}});
  const [logo,setLogo]=useState(()=>{try{return localStorage.getItem("morris_logo")||null;}catch{return null;}});
  const [search,setSearch]=useState("");
  const [recents,setRecents]=useState(()=>{try{return JSON.parse(localStorage.getItem("morris_recents")||"[]");}catch{return [];}});
  const [favourites,setFavourites]=useState(()=>{try{return JSON.parse(localStorage.getItem("morris_favs")||"[]");}catch{return [];}});

  // Persist to localStorage whenever state changes
  useEffect(()=>{try{localStorage.setItem("morris_trade",trade);}catch{}},[trade]);
  useEffect(()=>{try{localStorage.setItem("morris_history",JSON.stringify(history));}catch{}},[history]);
  useEffect(()=>{try{localStorage.setItem("morris_profile",JSON.stringify(profile));}catch{}},[profile]);
  useEffect(()=>{try{if(logo)localStorage.setItem("morris_logo",logo);else localStorage.removeItem("morris_logo");}catch{}},[logo]);
  useEffect(()=>{try{localStorage.setItem("morris_recents",JSON.stringify(recents));}catch{}},[recents]);
  useEffect(()=>{try{localStorage.setItem("morris_favs",JSON.stringify(favourites));}catch{}},[favourites]);

  const saveDoc=(tool,content)=>{const date=new Date().toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});setHistory(h=>[...h,{tool,content,date}].slice(-50));};

  const navigateTo=(id)=>{
    setActive(id);
    setSearch("");
    setRecents(r=>{const filtered=r.filter(x=>x!==id); return [id,...filtered].slice(0,5);});
  };

  const toggleFav=(id)=>{
    setFavourites(f=>f.includes(id)?f.filter(x=>x!==id):[...f,id]);
  };

  const sections=[...new Set(TOOLS.map(t=>t.section))];

  const filteredTools = search.trim()
    ? TOOLS.filter(t=>t.label.toLowerCase().includes(search.toLowerCase())||t.section.toLowerCase().includes(search.toLowerCase()))
    : null;

  const recentTools = recents.map(id=>TOOLS.find(t=>t.id===id)).filter(Boolean);
  const favTools = favourites.map(id=>TOOLS.find(t=>t.id===id)).filter(Boolean);

  const renderTool=()=>{
    const p={trade,profile,logo,onSave:saveDoc,favourites,toggleFav};
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
    if(active==="siteaccess") return <SiteAccessPermit {...p}/>;
    if(active==="measurement") return <MeasurementRecord {...p}/>;
    if(active==="newstarter") return <NewStarterPack {...p}/>;
    if(active==="satisfaction") return <ClientSurvey {...p}/>;
    if(active==="hireagree") return <HireAgreement {...p}/>;
    if(active==="labouralloc") return <LabourAllocation/>;
    if(active==="purchaseorder") return <PurchaseOrder {...p}/>;
    if(active==="subcispay") return <SubbiPayCert {...p}/>;
    if(active==="hspolicy") return <HSPolicy {...p}/>;
    if(active==="subbicheck") return <SubbiCompliance/>;
    if(active==="commercialrpt") return <CommercialReport {...p}/>;
    if(active==="tenderletter") return <TenderLetter {...p}/>;
    if(active==="defectstracker") return <DefectsTracker/>;
    if(active==="about") return <AboutMorris/>;
    if(active==="verbvariation") return <VerbalVariation {...p}/>;
    if(active==="phototodoc") return <PhotoToDoc {...p}/>;
    if(active==="cispredict") return <CISPredict favourites={favourites} toggleFav={toggleFav}/>;
    if(active==="scopeworks") return <ScopeOfWorks {...p}/>;
    if(active==="pwvartrack") return <PWVarTracker {...p}/>;
    if(active==="standingtime") return <StandingTimeCalc {...p}/>;
    if(active==="pwprofit") return <PWProfitCalc {...p}/>;
    if(active==="offline") return <OfflineMode profile={profile} favourites={favourites} navigateTo={navigateTo}/>;
    if(active==="favourites") return <FavouritesPage favourites={favourites} navigateTo={navigateTo}/>;
    if(active==="history") return <History history={history} onDelete={i=>setHistory(h=>h.filter((_,j)=>j!==h.length-1-i))}/>;
    if(active==="profile") return <Profile profile={profile} setProfile={setProfile} logo={logo} setLogo={setLogo}/>;
    if(toolConfigs[active]) return <DocTool key={active} toolId={active} {...p}/>;
    return null;
  };

  if(!user) return <><style>{css}</style><LoginScreen onLogin={handleLogin}/></>;

  return(
    <>
      <style>{css}</style>
      <div className="app">
        <div className="header">
          <div className="logo">MORRIS<span>.</span></div>
          <div className="header-right">
            {history.length>0&&<span className="tag">{history.length} saved</span>}
            <span style={{fontSize:11,color:"#e8a020",letterSpacing:1}}>👤 {user}</span>
            <button className="trade-pill" onClick={()=>{setTempTrade(trade);setShowTradeModal(true);}}>⚙ {trade}</button>
            <button onClick={handleLogout} style={{background:"none",border:"1px solid #222",borderRadius:4,color:"#555",fontSize:10,padding:"4px 8px",cursor:"pointer",letterSpacing:1}}>LOG OUT</button>
          </div>
        </div>
        <div className="layout">
          <div className="sidebar">

            {/* Search */}
            <div className="sidebar-search">
              <div className="search-wrap">
                <span className="search-icon">🔍</span>
                <input
                  className="search-input"
                  placeholder="Search tools..."
                  value={search}
                  onChange={e=>setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Search results */}
            {search.trim() && (
              <div>
                <div className="sec-label-row"><span className="sec-label-text">Search Results</span></div>
                {filteredTools.length===0 && <div className="no-results">No tools found</div>}
                {filteredTools.map(t=>(
                  <div key={t.id} className={`nav-item ${active===t.id?"active":""}`} onClick={()=>navigateTo(t.id)}>
                    <span className="nav-icon">{t.icon}</span>
                    <span className="nav-label">{t.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Not searching — show normal sidebar */}
            {!search.trim() && (<>

              {/* Favourites */}
              {favTools.length>0&&(
                <div>
                  <div className="sec-label-row"><span className="sec-label-text" style={{color:"#e8a020"}}>★ Favourites</span></div>
                  {favTools.map(t=>(
                    <div key={t.id} className={`nav-item ${active===t.id?"active":""}`} onClick={()=>navigateTo(t.id)}>
                      <span className="nav-icon">{t.icon}</span>
                      <span className="nav-label">{t.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Recently Used */}
              {recentTools.length>0&&(
                <div>
                  <div className="sec-label-row"><span className="sec-label-text">Recently Used</span></div>
                  {recentTools.map(t=>(
                    <div key={t.id} className={`nav-item ${active===t.id?"active":""}`} onClick={()=>navigateTo(t.id)}>
                      <span className="nav-icon">{t.icon}</span>
                      <span className="nav-label">{t.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* All sections */}
              {sections.map(sec=>(
                <div key={sec}>
                  <div className="sec-label-row">
                    <span className="sec-label-text">{sec}</span>
                  </div>
                  {TOOLS.filter(t=>t.section===sec).map(t=>(
                    <div key={t.id} className={`nav-item ${active===t.id?"active":""}`} onClick={()=>navigateTo(t.id)}>
                      <span className="nav-icon">{t.icon}</span>
                      <span className="nav-label">{t.label}</span>
                      {t.id==="history"&&history.length>0&&<span style={{marginLeft:"auto",fontSize:10,color:"#e8a020",flexShrink:0}}>{history.length}</span>}
                      {t.id==="favourites"&&favourites.length>0&&<span style={{marginLeft:"auto",fontSize:10,color:"#e8a020",flexShrink:0}}>{favourites.length}</span>}
                    </div>
                  ))}
                </div>
              ))}

            </>)}
          </div>
          <div className="main">
            {!profile.company&&active!=="profile"&&active!=="favourites"&&active!=="history"&&(
              <div onClick={()=>navigateTo("profile")} style={{background:"rgba(232,160,32,.06)",border:"1px solid rgba(232,160,32,.2)",borderRadius:8,padding:"10px 16px",marginBottom:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",transition:"all .2s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(232,160,32,.1)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(232,160,32,.06)"}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:16}}>👤</span>
                  <div>
                    <div style={{fontSize:12,color:"#e8a020",fontWeight:600}}>Set up your profile first</div>
                    <div style={{fontSize:11,color:"#666"}}>Morris will auto-fill your company name, UTR and details into every document</div>
                  </div>
                </div>
                <span style={{color:"#e8a020",fontSize:12}}>→</span>
              </div>
            )}
            {renderTool()}
          </div>
        </div>
        {showTradeModal&&(<div className="modal-overlay" onClick={()=>setShowTradeModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><h2>Your Trade</h2><p>Morris tailors every document to your trade.</p><div className="trade-grid">{TRADES.map(t=><div key={t} className={`trade-opt ${tempTrade===t?"sel":""}`} onClick={()=>setTempTrade(t)}>{t}</div>)}</div><button className="confirm-btn" onClick={()=>{setTrade(tempTrade);setShowTradeModal(false);}}>CONFIRM TRADE</button></div></div>)}
      </div>
    </>
  );
}
