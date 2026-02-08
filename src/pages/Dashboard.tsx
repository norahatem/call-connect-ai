import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Settings, History, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { SearchBox } from '@/components/search/SearchBox';
import { BookingOptionsModal, BookingOptions } from '@/components/booking/BookingOptionsModal';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { generateMockProviders } from '@/lib/mock-providers';
import { Provider } from '@/types';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, profile, loading } = useAuth();
  
  const [isSearching, setIsSearching] = useState(false);
  const [searchData, setSearchData] = useState<{ service: string; location: string } | null>(null);
  const [providers, setProviders] = useState<Omit<Provider, 'id' | 'created_at'>[]>([]);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [searchId, setSearchId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth/login');
    }
  }, [user, loading, navigate]);

  const handleSearch = async (service: string, location: string) => {
    setIsSearching(true);
    setSearchData({ service, location });

    // Create search in database with new fields
    const { data: searchRecord, error } = await supabase
      .from('searches')
      .insert({
        user_id: user!.id,
        service,
        location,
        status: 'discovering',
        booking_mode: 'single',
        stage: 'discovery',
      })
      .select()
      .single();

    if (error || !searchRecord) {
      console.error('Failed to create search:', error);
      setIsSearching(false);
      return;
    }

    setSearchId(searchRecord.id);

    // Simulate discovery delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Generate mock providers
    const mockProviders = generateMockProviders(service, location, searchRecord.id);
    setProviders(mockProviders);

    // Insert providers into database
    const { data: insertedProviders } = await supabase
      .from('providers')
      .insert(mockProviders)
      .select();

    if (insertedProviders) {
      setIsSearching(false);
      setShowBookingModal(true);
    }
  };

  const handleBookingComplete = async (options: BookingOptions) => {
    if (!searchId) return;

    // Build preferences with all booking options
    const preferencesJson = {
      category: options.category,
      intake_data: options.intakeData,
      time_preference: 'flexible',
    };
    
    // Update search with all options
    await supabase
      .from('searches')
      .update({ 
        preferences: preferencesJson,
        status: 'calling',
        booking_mode: options.bookingMode,
        stage: options.bookingMode === 'multi' ? 'discovery' : 'booking',
        additional_requirements: options.additionalRequirements || null,
        voice_preference: JSON.parse(JSON.stringify(options.voicePreference)),
        scoring_weights: JSON.parse(JSON.stringify(options.scoringWeights)),
      })
      .eq('id', searchId);

    setShowBookingModal(false);
    
    // Navigate to appropriate page based on booking mode
    if (options.bookingMode === 'multi') {
      navigate(`/calling/${searchId}?stage=scout`);
    } else {
      navigate(`/calling/${searchId}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="container flex items-center justify-between h-16 px-4">
          <Logo size="sm" />
          
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/bookings')}
              className="text-muted-foreground hover:text-foreground"
              title="Booking history"
            >
              <History className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/settings')}
              className="text-muted-foreground hover:text-foreground"
              title="Settings"
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero section */}
      <main className="container px-4">
        <div className="hero-gradient pt-16 pb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6">
              <Zap className="h-4 w-4" />
              AI-Powered Booking
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
              Book appointments
              <br />
              <span className="text-gradient-primary">with a single search</span>
            </h1>
            
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              Our AI calls providers for you, finds the best availability, 
              and books your appointment automatically.
            </p>
          </motion.div>

          {/* Search box */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <SearchBox 
              onSearch={handleSearch}
              isLoading={isSearching}
            />
          </motion.div>
        </div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="grid md:grid-cols-3 gap-6 py-16"
        >
          {[
            {
              title: 'Instant Discovery',
              description: 'Find 15+ providers in seconds, ranked by rating and distance.',
              icon: '🔍'
            },
            {
              title: 'Parallel Calling',
              description: 'Our AI calls multiple providers simultaneously to find availability.',
              icon: '📞'
            },
            {
              title: 'Auto Booking',
              description: 'First available slot gets booked instantly, added to your calendar.',
              icon: '✨'
            }
          ].map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 + i * 0.1 }}
              className="glass-card rounded-2xl p-6 card-hover"
            >
              <div className="text-3xl mb-4">{feature.icon}</div>
              <h3 className="font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </main>

      {/* Booking Options Modal */}
      <BookingOptionsModal
        open={showBookingModal}
        onOpenChange={setShowBookingModal}
        onComplete={handleBookingComplete}
        service={searchData?.service || ''}
      />
    </div>
  );
}
