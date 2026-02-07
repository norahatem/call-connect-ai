import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  CheckCircle2, 
  Calendar, 
  MapPin, 
  Phone, 
  FileText, 
  Download,
  ArrowRight,
  Clock
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Logo } from '@/components/ui/logo';
import { StarRating } from '@/components/ui/star-rating';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Provider, Booking, Call, TranscriptLine } from '@/types';

export default function BookingConfirmationPage() {
  const navigate = useNavigate();
  const { searchId } = useParams<{ searchId: string }>();
  const { user, profile } = useAuth();
  
  const [booking, setBooking] = useState<Booking | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    if (!user) return;

    const loadBooking = async () => {
      // Get the most recent booking for this user
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (bookingError) {
        console.error('Error loading booking:', bookingError);
        return;
      }

      if (bookingData) {
        setBooking(bookingData as unknown as Booking);

        // Load provider
        const { data: providerData } = await supabase
          .from('providers')
          .select('*')
          .eq('id', bookingData.provider_id)
          .maybeSingle();

        if (providerData) {
          setProvider(providerData as unknown as Provider);
        }

        // Load call for transcript
        const { data: callData } = await supabase
          .from('calls')
          .select('*')
          .eq('id', bookingData.call_id)
          .maybeSingle();

        if (callData) {
          setCall(callData as unknown as Call);
        }

        // Trigger confetti on mount
        setTimeout(() => {
          confetti({
            particleCount: 150,
            spread: 100,
            origin: { y: 0.4 },
            colors: ['#10b981', '#3b82f6', '#ffffff', '#8b5cf6']
          });
        }, 500);
      }
    };

    loadBooking();
  }, [user]);

  const generateICS = () => {
    if (!booking || !provider) return;

    const startDate = new Date(booking.appointment_time);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour

    const formatDate = (date: Date) => {
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//CallFlow AI//Booking//EN
BEGIN:VEVENT
UID:${booking.id}@callflow.ai
DTSTART:${formatDate(startDate)}
DTEND:${formatDate(endDate)}
SUMMARY:Appointment with ${provider.name}
LOCATION:${provider.address}
DESCRIPTION:Confirmation Code: ${booking.confirmation_code}\\nPhone: ${provider.phone}
END:VEVENT
END:VCALENDAR`;

    const blob = new Blob([icsContent], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `appointment-${booking.confirmation_code}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!booking || !provider) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">Loading booking details...</p>
          <p className="text-sm text-muted-foreground mb-6">
            If this takes too long, the booking may still be processing.
          </p>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const appointmentDate = new Date(booking.appointment_time);

  return (
    <div className="min-h-screen bg-background hero-gradient">
      {/* Header */}
      <header className="p-6">
        <Link to="/dashboard">
          <Logo />
        </Link>
      </header>

      {/* Main content */}
      <main className="container max-w-2xl mx-auto px-4 py-8">
        {/* Success animation */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="text-center mb-8"
        >
          <div className="mx-auto w-24 h-24 rounded-full bg-success/20 flex items-center justify-center mb-6 glow-success">
            <CheckCircle2 className="h-12 w-12 text-success success-bounce" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Booking Confirmed!</h1>
          <p className="text-muted-foreground">Your appointment has been successfully scheduled</p>
        </motion.div>

        {/* Booking details card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="glass-card overflow-hidden mb-6">
            <CardContent className="p-6 space-y-6">
              {/* Provider info */}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Phone className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-semibold">{provider.name}</h2>
                  <StarRating rating={provider.rating} reviewCount={provider.review_count} className="mt-1" />
                </div>
              </div>

              {/* Appointment time */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-success/10 border border-success/30">
                <Calendar className="h-6 w-6 text-success flex-shrink-0" />
                <div>
                  <p className="font-semibold text-success">
                    {appointmentDate.toLocaleDateString('en-US', { 
                      weekday: 'long',
                      month: 'long', 
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </p>
                  <p className="text-success/80">
                    {appointmentDate.toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid gap-4">
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Location</p>
                    <p className="font-medium">{provider.address}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{provider.phone}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Confirmation Code</p>
                    <p className="font-mono font-bold text-primary text-lg">{booking.confirmation_code}</p>
                  </div>
                </div>
              </div>

              {/* Calendar badge */}
              {profile?.calendar_connected && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Added to Google Calendar
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-3"
        >
          <Button 
            onClick={generateICS}
            variant="outline"
            className="w-full h-12 border-border/50 hover:bg-muted"
          >
            <Download className="mr-2 h-4 w-4" />
            Download Calendar Event (.ics)
          </Button>

          <Button 
            onClick={() => setShowTranscript(!showTranscript)}
            variant="ghost"
            className="w-full text-muted-foreground hover:text-foreground"
          >
            <Clock className="mr-2 h-4 w-4" />
            {showTranscript ? 'Hide' : 'View'} Call Transcript
          </Button>

          {/* Transcript */}
          {showTranscript && call && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Card className="glass-card">
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-3">Call Transcript</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                    {(call.transcript as TranscriptLine[]).map((line, i) => (
                      <div 
                        key={i}
                        className={`transcript-line ${line.speaker === 'ai' ? 'transcript-ai' : 'transcript-provider'}`}
                      >
                        <span className="font-medium">
                          {line.speaker === 'ai' ? 'AI Assistant: ' : 'Provider: '}
                        </span>
                        {line.text}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Call duration: {Math.floor(call.duration / 60)}:{String(call.duration % 60).padStart(2, '0')}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          <Button 
            onClick={() => navigate('/dashboard')}
            className="w-full h-12 mt-4 font-semibold bg-gradient-primary hover:opacity-90 transition-opacity"
          >
            Book Another Service
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </motion.div>
      </main>
    </div>
  );
}
