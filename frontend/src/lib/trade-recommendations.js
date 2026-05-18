// Trade → recommended tool IDs. Tradesmen see these on their dashboard.
// Default list applies if a trade isn't explicitly mapped.

const DEFAULT_RECS = [
  "variation-letter", "rams", "cis-invoice", "site-diary",
  "quote-builder", "toolbox-talk", "retention-chaser", "payment-chaser",
];

export const TRADE_RECOMMENDATIONS = {
  "Bricklayer": ["rams", "site-diary", "quote-builder", "cis-invoice", "measurement-record", "manual-handling", "weather-log", "variation-letter"],
  "Carpenter and Joiner": ["rams", "quote-builder", "snagging-list", "cis-invoice", "measurement-record", "variation-letter", "daywork-sheet", "site-diary"],
  "Crane Operator": ["rams", "working-at-height-rescue", "site-access-permit", "incident-report", "site-diary", "manual-handling", "timesheet", "noise-assessment"],
  "Drainage Engineer": ["rams", "coshh", "site-diary", "cis-invoice", "variation-letter", "quote-builder", "daywork-sheet", "incident-report"],
  "Dry Liner": ["rams", "price-work-quote", "pricework-profit", "measurement-record", "cis-invoice", "variation-letter", "site-diary", "manual-handling"],
  "Duct Fitter": ["rams", "variation-letter", "verbal-to-variation", "measurement-record", "cis-invoice", "working-at-height-rescue", "site-diary", "quote-builder"],
  "Electrician": ["rams", "variation-letter", "cis-invoice", "site-diary", "working-at-height-rescue", "quote-builder", "toolbox-talk", "snagging-list"],
  "EV Charger Installer": ["rams", "quote-builder", "variation-letter", "cis-invoice", "handover-certificate", "site-diary", "coshh", "snagging-list"],
  "Fire Alarm Engineer": ["rams", "site-diary", "handover-certificate", "variation-letter", "cis-invoice", "quote-builder", "snagging-list", "toolbox-talk"],
  "Fire Stopper": ["rams", "site-diary", "photo-evidence-log", "variation-letter", "cis-invoice", "handover-certificate", "snagging-list", "toolbox-talk"],
  "Floor Layer and Screeder": ["rams", "price-work-quote", "measurement-record", "cis-invoice", "variation-letter", "site-diary", "coshh", "manual-handling"],
  "Gas Engineer": ["rams", "coshh", "variation-letter", "cis-invoice", "handover-certificate", "site-diary", "quote-builder", "incident-report"],
  "General Builder": ["rams", "quote-builder", "site-diary", "cis-invoice", "variation-letter", "snagging-list", "subcontract-letter", "purchase-order"],
  "Glazier": ["rams", "working-at-height-rescue", "manual-handling", "site-diary", "cis-invoice", "variation-letter", "quote-builder", "snagging-list"],
  "Groundworker": ["rams", "coshh", "asbestos-record", "site-diary", "cis-invoice", "variation-letter", "weather-log", "incident-report"],
  "Lagger": ["rams", "coshh", "asbestos-record", "cis-invoice", "variation-letter", "site-diary", "manual-handling", "toolbox-talk"],
  "Painter and Decorator": ["rams", "coshh", "quote-builder", "snagging-list", "cis-invoice", "variation-letter", "site-diary", "price-work-quote"],
  "Pipefitter": ["rams", "coshh", "variation-letter", "cis-invoice", "site-diary", "measurement-record", "working-at-height-rescue", "toolbox-talk"],
  "Plant Operator": ["rams", "site-diary", "incident-report", "noise-assessment", "timesheet", "manual-handling", "weather-log", "site-access-permit"],
  "Plasterer": ["rams", "price-work-quote", "measurement-record", "site-diary", "cis-invoice", "manual-handling", "variation-letter", "snagging-list"],
  "Plumber": ["rams", "coshh", "quote-builder", "variation-letter", "cis-invoice", "site-diary", "snagging-list", "handover-certificate"],
  "Refrigeration Engineer": ["rams", "coshh", "variation-letter", "cis-invoice", "handover-certificate", "site-diary", "snagging-list", "toolbox-talk"],
  "Roofer": ["rams", "working-at-height-rescue", "weather-log", "site-diary", "cis-invoice", "variation-letter", "quote-builder", "incident-report"],
  "Scaffolder": ["rams", "working-at-height-rescue", "site-diary", "cis-invoice", "variation-letter", "toolbox-talk", "incident-report", "weather-log"],
  "Solar and Renewables Installer": ["rams", "working-at-height-rescue", "quote-builder", "variation-letter", "cis-invoice", "handover-certificate", "site-diary", "snagging-list"],
  "Stonemason": ["rams", "manual-handling", "quote-builder", "cis-invoice", "variation-letter", "site-diary", "measurement-record", "toolbox-talk"],
  "Structural Steel Erector": ["rams", "working-at-height-rescue", "site-access-permit", "cis-invoice", "variation-letter", "site-diary", "manual-handling", "incident-report"],
  "Suspended Ceiling Fitter": ["rams", "price-work-quote", "measurement-record", "cis-invoice", "variation-letter", "site-diary", "working-at-height-rescue", "snagging-list"],
  "Telecoms Engineer": ["rams", "site-access-permit", "site-diary", "cis-invoice", "variation-letter", "handover-certificate", "quote-builder", "snagging-list"],
  "Traffic Marshal": ["rams", "site-diary", "incident-report", "toolbox-talk", "timesheet", "weather-log", "site-access-permit", "reminders"],
  "Wall and Floor Tiler": ["rams", "price-work-quote", "measurement-record", "quote-builder", "cis-invoice", "variation-letter", "site-diary", "snagging-list"],
  "Welder and Fabricator": ["rams", "coshh", "site-access-permit", "noise-assessment", "cis-invoice", "variation-letter", "site-diary", "incident-report"],
};

export function recommendationsFor(trade) {
  return TRADE_RECOMMENDATIONS[trade] || DEFAULT_RECS;
}
