import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import WarRoom from "./pages/calling/WarRoom";
import BookingConfirmation from "./pages/booking/Confirmation";
import BookingHistory from "./pages/booking/History";
import Settings from "./pages/settings/Settings";
import VoiceTest from "./pages/testing/VoiceTest";
import VoiceAgentTest from "./pages/testing/VoiceAgentTest";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/auth/login" element={<Login />} />
            <Route path="/auth/signup" element={<Signup />} />
            <Route path="/calling/:searchId" element={<WarRoom />} />
            <Route path="/booking/:searchId" element={<BookingConfirmation />} />
            <Route path="/bookings" element={<BookingHistory />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/test-voice" element={<VoiceTest />} />
            <Route path="/test-agent" element={<VoiceAgentTest />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
