import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Phone, Calendar, Zap, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { useAuth } from '@/hooks/useAuth';

export default function IndexPage() {
  const { user, loading } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="container flex items-center justify-between h-16 px-4">
          <Logo />
          
          <div className="flex items-center gap-4">
            {loading ? (
              <div className="w-8 h-8 animate-pulse bg-muted rounded-full" />
            ) : user ? (
              <Link to="/dashboard">
                <Button className="bg-gradient-primary hover:opacity-90 transition-opacity">
                  Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/auth/login">
                  <Button variant="ghost">Sign In</Button>
                </Link>
                <Link to="/auth/signup">
                  <Button className="bg-gradient-primary hover:opacity-90 transition-opacity">
                    Get Started
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-32 pb-24 hero-gradient overflow-hidden">
        <div className="container px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center max-w-4xl mx-auto"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-8"
            >
              <Zap className="h-4 w-4" />
              Powered by AI Voice Technology
            </motion.div>

            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
              Stop waiting on hold.
              <br />
              <span className="text-gradient-primary">Let AI book for you.</span>
            </h1>

            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              Tell us what you need. Our AI calls providers, negotiates availability, 
              and books your appointment—all in under 2 minutes.
            </p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Link to={user ? '/dashboard' : '/auth/signup'}>
                <Button 
                  size="lg"
                  className="h-14 px-8 text-lg font-semibold bg-gradient-primary hover:opacity-90 transition-opacity glow-primary"
                >
                  Start Booking Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/auth/login">
                <Button 
                  variant="outline" 
                  size="lg"
                  className="h-14 px-8 text-lg border-border/50 hover:bg-muted"
                >
                  Watch Demo
                </Button>
              </Link>
            </motion.div>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="grid grid-cols-3 gap-8 max-w-2xl mx-auto mt-20"
          >
            {[
              { value: '15+', label: 'Providers called' },
              { value: '<2min', label: 'Average booking time' },
              { value: '99%', label: 'Success rate' }
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-primary">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] pointer-events-none">
          <div className="absolute inset-0 bg-gradient-radial from-primary/10 to-transparent opacity-50" />
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 bg-card/30">
        <div className="container px-4">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              How it works
            </h2>
            <p className="text-lg text-muted-foreground">
              Three simple steps to your next appointment
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                step: '01',
                icon: <Star className="h-6 w-6" />,
                title: 'Search for a service',
                description: 'Enter what you need—dentist, plumber, hair salon—and your location. We find 15+ top-rated providers instantly.'
              },
              {
                step: '02',
                icon: <Phone className="h-6 w-6" />,
                title: 'AI calls providers',
                description: 'Our AI calls multiple providers simultaneously, asks about availability, and identifies the best option for you.'
              },
              {
                step: '03',
                icon: <Calendar className="h-6 w-6" />,
                title: 'Get booked instantly',
                description: 'The first available slot gets booked automatically. Confirmation and calendar invite sent to you immediately.'
              }
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="relative glass-card rounded-2xl p-8"
              >
                <div className="text-5xl font-bold text-muted/20 absolute top-6 right-6">
                  {item.step}
                </div>
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary mb-6">
                  {item.icon}
                </div>
                <h3 className="text-xl font-semibold mb-3">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24">
        <div className="container px-4">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card rounded-3xl p-12 md:p-16 text-center max-w-4xl mx-auto relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-radial from-primary/10 to-transparent opacity-50" />
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Ready to save hours of hold time?
              </h2>
              <p className="text-lg text-muted-foreground mb-8 max-w-xl mx-auto">
                Join thousands who've discovered the smarter way to book appointments.
              </p>
              <Link to={user ? '/dashboard' : '/auth/signup'}>
                <Button 
                  size="lg"
                  className="h-14 px-10 text-lg font-semibold bg-gradient-primary hover:opacity-90 transition-opacity glow-primary"
                >
                  Get Started for Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border/50">
        <div className="container px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <Logo size="sm" />
            <p className="text-sm text-muted-foreground">
              © 2025 CallFlow AI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
