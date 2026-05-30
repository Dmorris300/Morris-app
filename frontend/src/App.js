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
import CISRefundPredictor from "./pages/CISRefundPredictor";
import MileageTracker from "./pages/MileageTracker";
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
  const { user } = useAuth();
  // Allow the Profile page itself + a few safe areas through so the user can complete it
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const allowList = ["/app/profile", "/app/billing", "/app/privacy", "/app/terms", "/app/complaints", "/app/refund-policy"];
  if (allowList.some((p) => path.startsWith(p))) return children;
  if (!isProfileComplete(user)) return <Navigate to="/app/profile?complete=1" replace />;
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
            <Route path="cis-predictor" element={<ProfileGate><CISRefundPredictor /></ProfileGate>} />
            <Route path="mileage" element={<ProfileGate><MileageTracker /></ProfileGate>} />
            <Route path="vat" element={<ProfileGate><VatThreshold /></ProfileGate>} />
            <Route path="earnings" element={<ProfileGate><Earnings /></ProfileGate>} />
            <Route path="taxpot" element={<ProfileGate><TaxPot /></ProfileGate>} />
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
