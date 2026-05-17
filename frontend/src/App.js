import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./lib/auth";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import VerifyOtp from "./pages/VerifyOtp";
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
import Profile from "./pages/Profile";
import Favourites from "./pages/Favourites";
import History from "./pages/History";

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

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster theme="dark" position="top-right" toastOptions={{
          style: { background: "#121212", color: "#F0EDE8", border: "1px solid rgba(232,160,32,0.25)" },
        }} />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/verify-otp" element={<VerifyOtp />} />
          <Route path="/select-trade" element={<Protected><SelectTrade /></Protected>} />

          <Route path="/app" element={<TradeGate><AppShell /></TradeGate>}>
            <Route index element={<Dashboard />} />
            <Route path="tool/:toolId" element={<GenericToolPage />} />
            <Route path="wow/verbal-to-variation" element={<VerbalToVariation />} />
            <Route path="wow/photo-to-document" element={<PhotoToDocument />} />
            <Route path="cis-predictor" element={<CISRefundPredictor />} />
            <Route path="mileage" element={<MileageTracker />} />
            <Route path="vat" element={<VatThreshold />} />
            <Route path="earnings" element={<Earnings />} />
            <Route path="profile" element={<Profile />} />
            <Route path="favourites" element={<Favourites />} />
            <Route path="history" element={<History />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
