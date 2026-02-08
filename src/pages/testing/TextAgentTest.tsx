import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Calendar, Check, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Logo } from '@/components/ui/logo';
import { useToast } from '@/hooks/use-toast';
import { 
  checkAvailability, 
  bookAppointment, 
  parseTimeSlot, 
  formatSlot,
  getAvailableSlots,
  getCalendarEvents
} from '@/lib/mock-calendar';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCall?: {
    name: string;
    params: Record<string, any>;
    result: any;
  };
}

// Mock provider for testing
const mockProvider = {
  id: 'test-provider',
  name: "Dr. Smith's Dental Clinic",
  phone: '+1 (555) 123-4567',
  address: '123 Main St, City',
  distance: 1.2,
  rating: 4.8,
  review_count: 156,
};

export default function TextAgentTest() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'system',
      content: `Testing booking flow for: ${mockProvider.name}. This simulates the AI agent's calendar tools WITHOUT using ElevenLabs credits.`,
      timestamp: new Date(),
    },
    {
      id: '2',
      role: 'assistant',
      content: `Hi! I'm testing the booking system for ${mockProvider.name}. I can check your calendar availability and book appointments. Try asking me things like:\n\n• "Am I free tomorrow at 2pm?"\n• "What slots are available this week?"\n• "Book me for Friday at 10am"`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [bookingResult, setBookingResult] = useState<{
    slot: Date;
    confirmationCode: string;
  } | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Client tools (same as in useElevenLabsAgent)
  const clientTools = {
    check_availability: async (params: { proposed_time: string }) => {
      const proposedDate = parseTimeSlot(params.proposed_time);
      if (!proposedDate) {
        return { 
          available: false, 
          error: 'Could not parse the proposed time' 
        };
      }

      const endDate = new Date(proposedDate.getTime() + 60 * 60 * 1000);
      const result = checkAvailability(proposedDate, endDate);
      
      if (result.available) {
        return { 
          available: true, 
          slot: formatSlot(proposedDate),
          message: `You are available at ${formatSlot(proposedDate)}`
        };
      } else {
        const alternatives = getAvailableSlots(proposedDate, 60)
          .filter(s => s.available)
          .slice(0, 3)
          .map(s => formatSlot(s.start));
        
        return { 
          available: false, 
          conflict: result.conflictingEvent?.title,
          alternatives,
          message: `You have a conflict: "${result.conflictingEvent?.title}". Available alternatives: ${alternatives.join(', ')}`
        };
      }
    },

    confirm_booking: async (params: { appointment_time: string }) => {
      const appointmentDate = parseTimeSlot(params.appointment_time);
      if (!appointmentDate) {
        return { success: false, error: 'Invalid time format' };
      }

      const endDate = new Date(appointmentDate.getTime() + 60 * 60 * 1000);
      const confirmationCode = generateConfirmationCode();
      
      const result = bookAppointment(
        `Appointment at ${mockProvider.name}`,
        appointmentDate,
        endDate,
        mockProvider.name,
        confirmationCode
      );

      if (result.success) {
        setBookingResult({ slot: appointmentDate, confirmationCode });
        return { 
          success: true, 
          confirmation_code: confirmationCode,
          appointment_time: formatSlot(appointmentDate),
          message: `Booking confirmed! Confirmation code: ${confirmationCode}`
        };
      } else {
        return { success: false, error: result.error };
      }
    },

    get_available_slots: async (params: { date?: string; preference?: string }) => {
      const targetDate = params.date 
        ? parseTimeSlot(params.date) 
        : new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      if (!targetDate) {
        return { error: 'Could not parse date' };
      }

      const slots = getAvailableSlots(targetDate, 60)
        .filter(s => s.available)
        .slice(0, 5);

      let filteredSlots = slots;
      if (params.preference) {
        const pref = params.preference.toLowerCase();
        if (pref.includes('morning')) {
          filteredSlots = slots.filter(s => s.start.getHours() < 12);
        } else if (pref.includes('afternoon')) {
          filteredSlots = slots.filter(s => s.start.getHours() >= 12 && s.start.getHours() < 17);
        } else if (pref.includes('evening')) {
          filteredSlots = slots.filter(s => s.start.getHours() >= 17);
        }
      }

      return {
        available_slots: filteredSlots.map(s => ({
          time: formatSlot(s.start),
          date: s.start.toISOString(),
        })),
        message: `Found ${filteredSlots.length} available slots`
      };
    },

    get_calendar_events: async () => {
      const events = getCalendarEvents();
      return {
        events: events.map(e => ({
          title: e.title,
          start: formatSlot(e.start),
          end: formatSlot(e.end),
        })),
        message: `You have ${events.length} events on your calendar`
      };
    },
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Use Lovable AI to interpret the user's request and call tools
      const response = await supabase.functions.invoke('text-agent-chat', {
        body: {
          message: input.trim(),
          provider: mockProvider,
          conversationHistory: messages.filter(m => m.role !== 'system').map(m => ({
            role: m.role,
            content: m.content,
          })),
        },
      });

      if (response.error) throw response.error;

      const { intent, params, response: aiResponse } = response.data;

      // Execute the tool if needed
      let toolResult = null;
      if (intent && clientTools[intent as keyof typeof clientTools]) {
        toolResult = await clientTools[intent as keyof typeof clientTools](params);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: toolResult?.message || aiResponse || "I'm not sure how to help with that. Try asking about availability or booking.",
        timestamp: new Date(),
        toolCall: intent ? { name: intent, params, result: toolResult } : undefined,
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (toolResult?.success && toolResult?.confirmation_code) {
        toast({
          title: '🎉 Booking Confirmed!',
          description: `Code: ${toolResult.confirmation_code}`,
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
      
      // Fallback: simple pattern matching if edge function fails
      const fallbackResponse = await handleFallback(input.trim());
      setMessages(prev => [...prev, fallbackResponse]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleFallback = async (userInput: string): Promise<Message> => {
    const lower = userInput.toLowerCase();
    
    // Simple pattern matching fallback
    if (lower.includes('available') || lower.includes('free') || lower.includes('slot')) {
      if (lower.includes('book') || lower.includes('schedule')) {
        // Try to extract time and book
        const result = await clientTools.confirm_booking({ 
          appointment_time: userInput 
        });
        return {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: result.message || (result.success 
            ? `Booked! Confirmation: ${result.confirmation_code}` 
            : `Couldn't book: ${result.error}`),
          timestamp: new Date(),
          toolCall: { name: 'confirm_booking', params: { appointment_time: userInput }, result },
        };
      } else {
        // Check availability
        const result = await clientTools.check_availability({ 
          proposed_time: userInput 
        });
        return {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: result.message || (result.available 
            ? `Yes, you're free at ${result.slot}!` 
            : `You have a conflict. Try: ${result.alternatives?.join(', ')}`),
          timestamp: new Date(),
          toolCall: { name: 'check_availability', params: { proposed_time: userInput }, result },
        };
      }
    } else if (lower.includes('book') || lower.includes('schedule') || lower.includes('appointment')) {
      const result = await clientTools.confirm_booking({ 
        appointment_time: userInput 
      });
      return {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.message || (result.success 
          ? `Booked! Confirmation: ${result.confirmation_code}` 
          : `Couldn't book: ${result.error}`),
        timestamp: new Date(),
        toolCall: { name: 'confirm_booking', params: { appointment_time: userInput }, result },
      };
    } else if (lower.includes('calendar') || lower.includes('events') || lower.includes('schedule')) {
      const result = await clientTools.get_calendar_events();
      const eventList = result.events.map(e => `• ${e.title}: ${e.start}`).join('\n');
      return {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `${result.message}:\n\n${eventList}`,
        timestamp: new Date(),
        toolCall: { name: 'get_calendar_events', params: {}, result },
      };
    }

    // Get available slots as default
    const result = await clientTools.get_available_slots({});
    const slotList = result.available_slots?.map(s => `• ${s.time}`).join('\n') || 'No slots found';
    return {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: `Here are some available slots:\n\n${slotList}\n\nWould you like to book one of these?`,
      timestamp: new Date(),
      toolCall: { name: 'get_available_slots', params: {}, result },
    };
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="container flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <Logo size="sm" />
          </div>
          <Badge variant="secondary" className="gap-1">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            Text Mode (Free)
          </Badge>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container max-w-2xl mx-auto px-4 py-6 flex flex-col">
        <Card className="glass-card mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Testing: {mockProvider.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This tests the booking client tools using text chat. No ElevenLabs credits used!
          </CardContent>
        </Card>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          <AnimatePresence mode="popLayout">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role !== 'user' && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : message.role === 'system'
                      ? 'bg-muted/50 text-muted-foreground text-sm'
                      : 'bg-muted'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.toolCall && (
                    <div className="mt-2 pt-2 border-t border-border/50 text-xs opacity-70">
                      <Badge variant="outline" className="text-xs">
                        {message.toolCall.name}
                      </Badge>
                    </div>
                  )}
                </div>
                {message.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-primary-foreground" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          
          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted rounded-2xl px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </motion.div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Booking success */}
        {bookingResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4"
          >
            <Card className="bg-success/10 border-success/30">
              <CardContent className="py-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                  <Check className="h-5 w-5 text-success" />
                </div>
                <div>
                  <p className="font-medium">Booking Confirmed!</p>
                  <p className="text-sm text-muted-foreground">
                    {formatSlot(bookingResult.slot)} • Code: {bookingResult.confirmationCode}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about availability or book an appointment..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button onClick={handleSend} disabled={!input.trim() || isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </main>
    </div>
  );
}

function generateConfirmationCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  let code = '';
  for (let i = 0; i < 2; i++) code += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 4; i++) code += numbers[Math.floor(Math.random() * numbers.length)];
  return code;
}
