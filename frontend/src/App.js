import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./lib/auth";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import VerifyOtp from "./pages/VerifyOtp";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import SelectTrade from "./pages/SelectTrade";
import AppShell from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import GenericToolPage from "./pages/GenericToolPage";
import VerbalToVariation from "./pages/VerbalToVariation";
import PhotoToDocument from "./pages/PhotoToDocument";
import PhotoVault from "./pages/PhotoVault";
import AttentionPage from "./pages/AttentionPage";
import { ProjectsHub } from "./pages/Hubs";
import FinanceHub from "./pages/FinanceHub";
import ComplianceHub from "./pages/ComplianceHub";
import BusinessHub from "./pages/BusinessHub";
import ToolsLibrary from "./pages/ToolsLibrary";
import Settings from "./pages/Settings";
import MethodStatement from "./pages/MethodStatement";
import ToolboxTalk from "./pages/ToolboxTalk";
import Coshh from "./pages/Coshh";
import SiteDiary from "./pages/SiteDiary";
import QuoteBuilder from "./pages/QuoteBuilder";import Drafts from "./pages/Drafts";
import VariationOrders from "./pages/VariationOrders";
import CISRefundPredictor from "./pages/CISRefundPredictor";
import MileageTracker from "./pages/MileageTracker";
import PaymentChaser from "./pages/PaymentChaser";
import SelfAssessmentPrep from "./pages/SelfAssessmentPrep";
import MeasurementRecord from "./pages/MeasurementRecord";
import PreStartMeeting from "./pages/PreStartMeeting";
import ToolRegister from "./pages/ToolRegister";
import NoiseAssessment from "./pages/NoiseAssessment";
import WorkingAtHeightRescue from "./pages/WorkingAtHeightRescue";
import ManualHandling from "./pages/ManualHandling";
import VariationInstructionLog from "./pages/VariationInstructionLog";
import RetentionChaser from "./pages/RetentionChaser";
import SubcontractorManagement from "./pages/SubcontractorManagement";
import MeetingNotes from "./pages/MeetingNotes";
import WeatherLog from "./pages/WeatherLog";
import RiskRegister from "./pages/RiskRegister";
import ApprenticeManager from "./pages/ApprenticeManager";
import ProcurementSchedule from "./pages/ProcurementSchedule";
import PriceWorkQuote from "./pages/PriceWorkQuote";
import RateIncreaseLetter from "./pages/RateIncreaseLetter";
import SnaggingList from "./pages/SnaggingList";
import ContractReview from "./pages/ContractReview";
import HmrcCorrespondence from "./pages/HmrcCorrespondence";
import BadDebtLetter from "./pages/BadDebtLetter";
import PriceWorkVariationTracker from "./pages/PriceWorkVariationTracker";
import TenderLetter from "./pages/TenderLetter";
import PaymentTracker from "./pages/PaymentTracker";
import CisCalculator from "./pages/CisCalculator";
import DeliveryRecord from "./pages/DeliveryRecord";
import LabourAllocation from "./pages/LabourAllocation";
import PurchaseOrder from "./pages/PurchaseOrder";
import DisputeTimeline from "./pages/DisputeTimeline";
import IncidentReport from "./pages/IncidentReport";
import IncidentLog from "./pages/IncidentLog";
import SiteAccessPermit from "./pages/SiteAccessPermit";
import RamsLibrary from "./pages/RamsLibrary";
import ContractManagement from "./pages/ContractManagement";
import MultiUserSiteDiary from "./pages/MultiUserSiteDiary";
import CommercialReport from "./pages/CommercialReport";
import NewStarterPack from "./pages/NewStarterPack";
import Rams from "./pages/Rams";
import VatThreshold from "./pages/VatThreshold";
import Earnings from "./pages/Earnings";
import TaxPot from "./pages/TaxPot";
import CompanyChecker from "./pages/CompanyChecker";
import OfflineMode from "./pages/OfflineMode";
import TeamManagement from "./pages/TeamManagement";
import AcceptInvite from "./pages/AcceptInvite";
import Profile from "./pages/Profile";
import Favourites from "./pages/Favourites";
import History from "./pages/History";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";
import Billing from "./pages/Billing";
import MockCheckout from "./pages/MockCheckout";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsConditions from "./pages/TermsConditions";
import Complaints from "./pages/Complaints";
import RefundPolicy from "./pages/RefundPolicy";
import CookieBanner from "./components/CookieBanner";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#060606]"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function TradeGate({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.trade) return <Navigate to="/select-trade" replace />;
  return children;
}

// Mandatory profile fields that must be filled before any tool can be used.
// Admin / unlimited accounts bypass this gate.
const PROFILE_MANDATORY = ["fullName", "companyName", "address", "contactNumber", "utr", "trade", "cisStatus", "insuranceExpiry", "cscsExpiry"];

export function isProfileComplete(user) {
  if (!user) return false;
  if (user.isAdmin || user.isUnlimited) return true;
  return PROFILE_MANDATORY.every((k) => {
    const v = user[k];
    return typeof v === "string" ? v.trim().length > 0 : !!v;
  });
}

function ProfileGate({ children }) {
  // Profile completion is no longer mandatory — the user is in full control of
  // what they fill in and when. ProfileGate is now a passthrough so no tool
  // ever blocks on missing profile fields.
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster theme="dark" position="top-right" toastOptions={{
          style: { background: "#121212", color: "#F0EDE8", border: "1px solid rgba(232,160,32,0.25)" },
        }} />
        <CookieBanner />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verify-otp" element={<VerifyOtp />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsConditions />} />
          <Route path="/select-trade" element={<Protected><SelectTrade /></Protected>} />

          <Route path="/app" element={<TradeGate><AppShell /></TradeGate>}>
            <Route index element={<Dashboard />} />
            <Route path="tool/:toolId" element={<ProfileGate><GenericToolPage /></ProfileGate>} />
            <Route path="wow/verbal-to-variation" element={<ProfileGate><VerbalToVariation /></ProfileGate>} />
            <Route path="wow/photo-to-document" element={<ProfileGate><PhotoToDocument /></ProfileGate>} />
            <Route path="photo-vault" element={<ProfileGate><PhotoVault /></ProfileGate>} />
            {/* Legacy path — old "Site Photo Library" URL redirects into the Vault */}
            <Route path="site-photo-library" element={<Navigate to="/app/photo-vault" replace />} />
            {/* Command Centre V2 — hubs + attention overflow */}
            <Route path="attention" element={<ProfileGate><AttentionPage /></ProfileGate>} />
            <Route path="finance" element={<ProfileGate><FinanceHub /></ProfileGate>} />
            <Route path="business" element={<ProfileGate><BusinessHub /></ProfileGate>} />
            <Route path="compliance" element={<ProfileGate><ComplianceHub /></ProfileGate>} />
            <Route path="projects-hub" element={<ProfileGate><ProjectsHub /></ProfileGate>} />
            <Route path="tools-library" element={<ProfileGate><ToolsLibrary /></ProfileGate>} />
            <Route path="settings" element={<ProfileGate><Settings /></ProfileGate>} />
            <Route path="drafts" element={<ProfileGate><Drafts /></ProfileGate>} />
            <Route path="cis-predictor" element={<ProfileGate><CISRefundPredictor /></ProfileGate>} />
            <Route path="mileage" element={<ProfileGate><MileageTracker /></ProfileGate>} />
            <Route path="vat" element={<ProfileGate><VatThreshold /></ProfileGate>} />
            <Route path="earnings" element={<ProfileGate><Earnings /></ProfileGate>} />
            <Route path="taxpot" element={<ProfileGate><TaxPot /></ProfileGate>} />
            <Route path="payment-chaser" element={<ProfileGate><PaymentChaser /></ProfileGate>} />
            <Route path="self-assessment-prep" element={<ProfileGate><SelfAssessmentPrep /></ProfileGate>} />
            <Route path="measurement-record" element={<ProfileGate><MeasurementRecord /></ProfileGate>} />
            <Route path="prestart-meeting" element={<ProfileGate><PreStartMeeting /></ProfileGate>} />
            <Route path="tool-register" element={<ProfileGate><ToolRegister /></ProfileGate>} />
            <Route path="noise-assessment" element={<ProfileGate><NoiseAssessment /></ProfileGate>} />
            <Route path="working-at-height-rescue" element={<ProfileGate><WorkingAtHeightRescue /></ProfileGate>} />
            <Route path="manual-handling" element={<ProfileGate><ManualHandling /></ProfileGate>} />
            <Route path="variation-instruction-log" element={<ProfileGate><VariationInstructionLog /></ProfileGate>} />
            <Route path="retention-chaser" element={<ProfileGate><RetentionChaser /></ProfileGate>} />
            <Route path="subbie-mgmt" element={<ProfileGate><SubcontractorManagement /></ProfileGate>} />
            <Route path="meeting-notes" element={<ProfileGate><MeetingNotes /></ProfileGate>} />
            <Route path="weather-log" element={<ProfileGate><WeatherLog /></ProfileGate>} />
            <Route path="risk-register" element={<ProfileGate><RiskRegister /></ProfileGate>} />
            <Route path="apprentice-manager" element={<ProfileGate><ApprenticeManager /></ProfileGate>} />
            <Route path="procurement-schedule" element={<ProfileGate><ProcurementSchedule /></ProfileGate>} />
            <Route path="price-work-quote" element={<ProfileGate><PriceWorkQuote /></ProfileGate>} />
            <Route path="rate-increase-letter" element={<ProfileGate><RateIncreaseLetter /></ProfileGate>} />
            <Route path="snagging-list" element={<ProfileGate><SnaggingList /></ProfileGate>} />
            <Route path="contract-review" element={<ProfileGate><ContractReview /></ProfileGate>} />
            <Route path="hmrc-correspondence" element={<ProfileGate><HmrcCorrespondence /></ProfileGate>} />
            <Route path="bad-debt-letter" element={<ProfileGate><BadDebtLetter /></ProfileGate>} />
            <Route path="pricework-variation-tracker" element={<ProfileGate><PriceWorkVariationTracker /></ProfileGate>} />
            <Route path="tender-letter" element={<ProfileGate><TenderLetter /></ProfileGate>} />
            <Route path="payment-tracker" element={<ProfileGate><PaymentTracker /></ProfileGate>} />
            <Route path="cis-calculator" element={<ProfileGate><CisCalculator /></ProfileGate>} />
            <Route path="delivery-record" element={<ProfileGate><DeliveryRecord /></ProfileGate>} />
            <Route path="labour-allocation" element={<ProfileGate><LabourAllocation /></ProfileGate>} />
            <Route path="purchase-order" element={<ProfileGate><PurchaseOrder /></ProfileGate>} />
            <Route path="dispute-timeline" element={<ProfileGate><DisputeTimeline /></ProfileGate>} />
            <Route path="incident-report" element={<ProfileGate><IncidentReport /></ProfileGate>} />
            <Route path="incident-log" element={<ProfileGate><IncidentLog /></ProfileGate>} />
            <Route path="site-access-permit" element={<ProfileGate><SiteAccessPermit /></ProfileGate>} />
            <Route path="rams-library" element={<ProfileGate><RamsLibrary /></ProfileGate>} />
            <Route path="contract-mgmt" element={<ProfileGate><ContractManagement /></ProfileGate>} />
            <Route path="multiuser-site-diary" element={<ProfileGate><MultiUserSiteDiary /></ProfileGate>} />
            <Route path="commercial-report" element={<ProfileGate><CommercialReport /></ProfileGate>} />
            <Route path="new-starter-pack" element={<ProfileGate><NewStarterPack /></ProfileGate>} />
            <Route path="rams" element={<ProfileGate><Rams /></ProfileGate>} />
            <Route path="method-statement" element={<ProfileGate><MethodStatement /></ProfileGate>} />
            <Route path="toolbox-talk" element={<ProfileGate><ToolboxTalk /></ProfileGate>} />
            <Route path="coshh" element={<ProfileGate><Coshh /></ProfileGate>} />
            <Route path="site-diary" element={<ProfileGate><SiteDiary /></ProfileGate>} />
            <Route path="quote-builder" element={<ProfileGate><QuoteBuilder /></ProfileGate>} />
            <Route path="variation-orders" element={<ProfileGate><VariationOrders /></ProfileGate>} />
            <Route path="company-checker" element={<ProfileGate><CompanyChecker /></ProfileGate>} />
            <Route path="offline-mode" element={<OfflineMode />} />
            <Route path="team" element={<TeamManagement />} />
            <Route path="profile" element={<Profile />} />
            <Route path="favourites" element={<Favourites />} />
            <Route path="history" element={<History />} />
            <Route path="jobs" element={<ProfileGate><Jobs /></ProfileGate>} />
            <Route path="jobs/:jobId" element={<ProfileGate><JobDetail /></ProfileGate>} />
            <Route path="billing" element={<Billing />} />
            <Route path="billing/mock-checkout" element={<MockCheckout />} />
            <Route path="privacy" element={<PrivacyPolicy />} />
            <Route path="terms" element={<TermsConditions />} />
            <Route path="complaints" element={<Complaints />} />
            <Route path="refund-policy" element={<RefundPolicy />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
