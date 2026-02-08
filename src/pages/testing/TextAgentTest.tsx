import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Calendar, Check, ArrowLeft, Loader2, Phone } from 'lucide-react';
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
  role: 'agent' | 'receptionist' | 'system';
  content: string;
  timestamp: Date;
  toolCall?: {
    name: string;
    result: any;
  };
}

// Mock provider for testing
const mockProvider = {
  id: 'test-provider',
  name: "Dr. Smith's Dental Clinic",
  phone: '+1 (555) 123-4567',
  address: '123 Main St, City',
  service: 'dental cleaning',
};

// Mock user (the person the AI is booking for)
const mockUser = {
  name: 'Alex Johnson',
  phone: '+1 (555) 987-6543',
};

export default function TextAgentTest() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'system',
      content: `📞 CALL SIMULATION\n\nYou are playing the RECEPTIONIST at ${mockProvider.name}.\nThe AI agent is calling you to book an appointment for their client "${mockUser.name}".\n\nRespond as a real receptionist would - offer times, ask questions, confirm bookings.`,
      timestamp: new Date(),
    },
    {
      id: '1',
      role: 'agent',
      content: `Hi, this is an AI assistant calling on behalf of ${mockUser.name}. They're looking to schedule a ${mockProvider.service} appointment. Do you have any availability in the next few days?`,
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

  // Client tools - these check the USER's (client's) calendar
  const clientTools = {
    check_client_availability: async (proposedTime: string) => {
      const proposedDate = parseTimeSlot(proposedTime);
      if (!proposedDate) {
        return { available: false, error: 'Could not parse time' };
      }

      const endDate = new Date(proposedDate.getTime() + 60 * 60 * 1000);
      const result = checkAvailability(proposedDate, endDate);
      
      if (result.available) {
        return { 
          available: true, 
          slot: formatSlot(proposedDate),
        };
      } else {
        return { 
          available: false, 
          conflict: result.conflictingEvent?.title,
        };
      }
    },

    get_client_schedule: async () => {
      const events = getCalendarEvents();
      const slots = getAvailableSlots(new Date(), 60).filter(s => s.available).slice(0, 5);
      return {
        existingEvents: events.map(e => ({ title: e.title, time: formatSlot(e.start) })),
        availableSlots: slots.map(s => formatSlot(s.start)),
      };
    },

    book_appointment: async (appointmentTime: string, confirmationCode: string) => {
      const appointmentDate = parseTimeSlot(appointmentTime);
      if (!appointmentDate) {
        return { success: false, error: 'Invalid time' };
      }

      const endDate = new Date(appointmentDate.getTime() + 60 * 60 * 1000);
      
      const result = bookAppointment(
        `${mockProvider.service} at ${mockProvider.name}`,
        appointmentDate,
        endDate,
        mockProvider.name,
        confirmationCode
      );

      if (result.success) {
        setBookingResult({ slot: appointmentDate, confirmationCode });
        return { success: true, time: formatSlot(appointmentDate), confirmationCode };
      }
      return { success: false, error: result.error };
    },
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    // User's message is from the "receptionist" perspective
    const receptionistMessage: Message = {
      id: Date.now().toString(),
      role: 'receptionist',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, receptionistMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Call edge function to get AI agent's response
      const response = await supabase.functions.invoke('text-agent-chat', {
        body: {
          receptionistMessage: input.trim(),
          provider: mockProvider,
          user: mockUser,
          conversationHistory: messages.filter(m => m.role !== 'system').map(m => ({
            role: m.role === 'agent' ? 'assistant' : 'user',
            content: m.content,
          })),
        },
      });

      if (response.error) throw response.error;

      const { agentResponse, toolCalls } = response.data;

      // Execute any tool calls
      let toolResults: Message[] = [];
      if (toolCalls && toolCalls.length > 0) {
        for (const tool of toolCalls) {
          let result;
          if (tool.name === 'check_client_availability') {
            result = await clientTools.check_client_availability(tool.params.time);
          } else if (tool.name === 'get_client_schedule') {
            result = await clientTools.get_client_schedule();
          } else if (tool.name === 'book_appointment') {
            result = await clientTools.book_appointment(tool.params.time, tool.params.confirmationCode);
            if (result.success) {
              toast({
                title: '🎉 Appointment Booked!',
                description: `${mockUser.name}'s appointment confirmed`,
              });
            }
          }

          toolResults.push({
            id: `tool-${Date.now()}-${tool.name}`,
            role: 'system',
            content: `🔧 ${tool.name}: ${JSON.stringify(result)}`,
            timestamp: new Date(),
            toolCall: { name: tool.name, result },
          });
        }
      }

      // Add tool results and agent response
      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        content: agentResponse,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, ...toolResults, agentMessage]);

    } catch (error) {
      console.error('Chat error:', error);
      
      // Fallback response
      const fallbackMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        content: `Let me check my client's calendar... Could you tell me what times you have available?`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, fallbackMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const resetConversation = () => {
    setMessages([
      {
        id: '0',
        role: 'system',
        content: `📞 CALL SIMULATION\n\nYou are playing the RECEPTIONIST at ${mockProvider.name}.\nThe AI agent is calling you to book an appointment for their client "${mockUser.name}".\n\nRespond as a real receptionist would - offer times, ask questions, confirm bookings.`,
        timestamp: new Date(),
      },
      {
        id: '1',
        role: 'agent',
        content: `Hi, this is an AI assistant calling on behalf of ${mockUser.name}. They're looking to schedule a ${mockProvider.service} appointment. Do you have any availability in the next few days?`,
        timestamp: new Date(),
      },
    ]);
    setBookingResult(null);
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
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Phone className="h-3 w-3" />
              Call Simulation
            </Badge>
            <Button variant="outline" size="sm" onClick={resetConversation}>
              Reset
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container max-w-2xl mx-auto px-4 py-6 flex flex-col">
        <Card className="glass-card mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              You are the Receptionist
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p><strong>Provider:</strong> {mockProvider.name}</p>
            <p><strong>AI is booking for:</strong> {mockUser.name}</p>
            <p className="text-xs opacity-70">
              Respond as a receptionist would. Offer appointment times, ask for details, confirm bookings.
            </p>
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
                className={`flex gap-3 ${message.role === 'receptionist' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'agent' && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                {message.role === 'system' && (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    message.role === 'receptionist'
                      ? 'bg-primary text-primary-foreground'
                      : message.role === 'system'
                      ? 'bg-muted/50 text-muted-foreground text-xs font-mono'
                      : 'bg-muted'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.role === 'agent' && (
                    <p className="text-xs opacity-50 mt-1">AI Agent (calling for {mockUser.name})</p>
                  )}
                </div>
                {message.role === 'receptionist' && (
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
              <div className="bg-muted rounded-2xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Checking client's calendar...</span>
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
                  <p className="font-medium">Appointment Booked for {mockUser.name}!</p>
                  <p className="text-sm text-muted-foreground">
                    {formatSlot(bookingResult.slot)} • Code: {bookingResult.confirmationCode}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Input - You are the receptionist */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground text-center">
            You're the receptionist. Respond to the AI agent's booking request.
          </p>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Respond as the receptionist... (e.g., 'We have 2pm tomorrow available')"
              className="flex-1"
              disabled={isLoading}
            />
            <Button onClick={handleSend} disabled={!input.trim() || isLoading}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
