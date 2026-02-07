import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Calendar, 
  MapPin, 
  Phone, 
  Clock,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  FileText
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Logo } from '@/components/ui/logo';
import { StarRating } from '@/components/ui/star-rating';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Booking, Provider, BookingStatus } from '@/types';

interface BookingWithProvider extends Booking {
  provider: Provider;
}

export default function BookingHistoryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bookings, setBookings] = useState<BookingWithProvider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const loadBookings = async () => {
      setLoading(true);
      
      // Load all bookings for the user
      const { data: bookingsData, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('user_id', user.id)
        .order('appointment_time', { ascending: false });

      if (error) {
        console.error('Error loading bookings:', error);
        setLoading(false);
        return;
      }

      if (!bookingsData || bookingsData.length === 0) {
        setBookings([]);
        setLoading(false);
        return;
      }

      // Load providers for all bookings
      const providerIds = [...new Set(bookingsData.map(b => b.provider_id))];
      const { data: providersData } = await supabase
        .from('providers')
        .select('*')
        .in('id', providerIds);

      const providersMap = new Map(
        (providersData || []).map(p => [p.id, p as unknown as Provider])
      );

      const bookingsWithProviders: BookingWithProvider[] = bookingsData
        .map(booking => ({
          ...(booking as unknown as Booking),
          provider: providersMap.get(booking.provider_id)!,
        }))
        .filter(b => b.provider);

      setBookings(bookingsWithProviders);
      setLoading(false);
    };

    loadBookings();
  }, [user]);

  const now = new Date();
  const upcomingBookings = bookings.filter(
    b => new Date(b.appointment_time) >= now && b.status === 'confirmed'
  );
  const pastBookings = bookings.filter(
    b => new Date(b.appointment_time) < now || b.status !== 'confirmed'
  );

  const getStatusBadge = (status: BookingStatus, appointmentTime: string) => {
    const isPast = new Date(appointmentTime) < now;
    
    if (status === 'cancelled') {
      return <Badge variant="destructive">Cancelled</Badge>;
    }
    if (status === 'completed' || (isPast && status === 'confirmed')) {
      return <Badge className="bg-muted text-muted-foreground">Completed</Badge>;
    }
    return <Badge className="bg-success/20 text-success border-success/30">Upcoming</Badge>;
  };

  const BookingCard = ({ booking }: { booking: BookingWithProvider }) => {
    const appointmentDate = new Date(booking.appointment_time);
    const isPast = appointmentDate < now;

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={isPast ? 'opacity-70' : ''}
      >
        <Card className="glass-card hover:border-primary/30 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate">{booking.provider.name}</h3>
                <StarRating 
                  rating={booking.provider.rating} 
                  reviewCount={booking.provider.review_count} 
                  className="mt-0.5"
                />
              </div>
              {getStatusBadge(booking.status as BookingStatus, booking.appointment_time)}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="font-medium">
                  {appointmentDate.toLocaleDateString('en-US', { 
                    weekday: 'short',
                    month: 'short', 
                    day: 'numeric',
                    year: appointmentDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
                  })}
                  {' at '}
                  {appointmentDate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </span>
              </div>

              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{booking.provider.address}</span>
              </div>

              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4 flex-shrink-0" />
                <span className="font-mono text-xs">{booking.confirmation_code}</span>
              </div>
            </div>

            {!isPast && booking.status === 'confirmed' && (
              <div className="flex gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => window.open(`tel:${booking.provider.phone}`)}
                >
                  <Phone className="h-3 w-3 mr-1" />
                  Call
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate(`/booking/${booking.id}`)}
                >
                  View Details
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="container flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/dashboard')}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Logo size="sm" />
          </div>
        </div>
      </header>

      <main className="container max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Booking History</h1>
          <p className="text-muted-foreground">
            View your past and upcoming appointments
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : bookings.length === 0 ? (
          <Card className="glass-card">
            <CardContent className="p-8 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No bookings yet</h3>
              <p className="text-muted-foreground mb-6">
                Start by searching for a service and let our AI book it for you.
              </p>
              <Button onClick={() => navigate('/dashboard')}>
                Find a Service
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Upcoming */}
            {upcomingBookings.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <h2 className="text-lg font-semibold">Upcoming</h2>
                  <Badge variant="secondary">{upcomingBookings.length}</Badge>
                </div>
                <div className="space-y-3">
                  {upcomingBookings.map(booking => (
                    <BookingCard key={booking.id} booking={booking} />
                  ))}
                </div>
              </section>
            )}

            {/* Past */}
            {pastBookings.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">Past</h2>
                  <Badge variant="secondary">{pastBookings.length}</Badge>
                </div>
                <div className="space-y-3">
                  {pastBookings.map(booking => (
                    <BookingCard key={booking.id} booking={booking} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
