import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Check, User, Phone, Mail, Loader2, IdCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Logo } from '@/components/ui/logo';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export default function SettingsPage() {
  const { profile, updateProfile, signOut } = useAuth();
  const { toast } = useToast();
  
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [dateOfBirth, setDateOfBirth] = useState(profile?.date_of_birth || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [calendarConnected, setCalendarConnected] = useState(profile?.calendar_connected || false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Keep local state in sync once profile loads
  useEffect(() => {
    setFullName(profile?.full_name || '');
    setDateOfBirth(profile?.date_of_birth || '');
    setPhone(profile?.phone || '');
    setCalendarConnected(profile?.calendar_connected || false);
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await updateProfile({
      phone,
      full_name: fullName || null,
      date_of_birth: dateOfBirth || null,
    });
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to save changes. Please try again.'
      });
    } else {
      toast({
        title: 'Saved',
        description: 'Your profile has been updated.'
      });
    }
    setSaving(false);
  };

  const handleCalendarConnect = async () => {
    setConnecting(true);
    
    // Mock OAuth flow
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const newStatus = !calendarConnected;
    const { error } = await updateProfile({ calendar_connected: newStatus });
    
    if (!error) {
      setCalendarConnected(newStatus);
      toast({
        title: newStatus ? 'Calendar Connected' : 'Calendar Disconnected',
        description: newStatus 
          ? 'Your Google Calendar is now connected.'
          : 'Your Google Calendar has been disconnected.'
      });
    }
    
    setConnecting(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="container flex items-center justify-between h-16 px-4">
          <Link to="/dashboard">
            <Logo size="sm" />
          </Link>
          <Button
            variant="ghost"
            onClick={signOut}
            className="text-muted-foreground hover:text-foreground"
          >
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="container max-w-2xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-2xl font-bold mb-8">Settings</h1>

          {/* Profile section */}
          <Card className="glass-card mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    value={profile?.email || ''}
                    disabled
                    className="pl-10 bg-muted/50 border-border/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <div className="relative">
                  <IdCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Jane Doe"
                    className="pl-10 bg-background border-border/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dob">Date of birth (dd/mm/yyyy)</Label>
                <Input
                  id="dob"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  placeholder="dd/mm/yyyy"
                  className="bg-background border-border/50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="pl-10 bg-background border-border/50"
                  />
                </div>
              </div>

              <Button 
                onClick={handleSave}
                disabled={saving}
                className="w-full"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Integrations section */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Integrations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="h-6 w-6">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">Google Calendar</p>
                    <p className="text-sm text-muted-foreground">
                      {calendarConnected ? 'Connected' : 'Add bookings to your calendar'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {calendarConnected && (
                    <span className="text-xs text-success flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      Connected
                    </span>
                  )}
                  <Switch
                    checked={calendarConnected}
                    onCheckedChange={handleCalendarConnect}
                    disabled={connecting}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}
