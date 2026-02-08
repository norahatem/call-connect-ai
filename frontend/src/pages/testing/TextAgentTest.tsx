import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Calendar, Check, ArrowLeft, Loader2, Phone, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/ui/logo';
import { useToast } from '@/hooks/use-toast';
import { useVoiceMode } from '@/hooks/useVoiceMode';
import { 
  checkAvailability, 
  bookAppointment, 
  parseTimeSlot, 
  formatSlot,
} from '@/lib/calendar-api';
import { ai } from '@/lib/api-client';

interface Message {
  id: string;
  role: 'agent' | 'receptionist' | 'system';
  content: string;
  timestamp: Date;
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
  const initialSpokenRef = useRef(false);

  // Voice mode hook
  const handleVoiceTranscript = useCallback((text: string) => {
    console.log('Voice transcript received:', text);
    setInput(text);
    // Auto-send after transcript
    setTimeout(() => {
      const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
      handleSendWithText(text);
    }, 100);
  }, []);

  const {
    isVoiceEnabled,
    isListening,
    isSpeaking,
    partialText,
    toggleVoiceMode,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  } = useVoiceMode({
    onTranscript: handleVoiceTranscript,
    onError: (error) => toast({ title: 'Voice Error', description: error, variant: 'destructive' }),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Speak the initial agent message when voice mode is enabled
  useEffect(() => {
    if (isVoiceEnabled && !initialSpokenRef.current && messages.length >= 2) {
      const initialAgentMessage = messages.find(m => m.role === 'agent');
      if (initialAgentMessage) {
        initialSpokenRef.current = true;
        speak(initialAgentMessage.content);
      }
    }
  }, [isVoiceEnabled, messages, speak]);

  // Client tools - these check the USER's (client's) calendar
  const executeTools = async (toolCalls: Array<{name: string, params: any}>) => {
    const results: Array<{name: string, result: any}> = [];
    
    for (const tool of toolCalls) {
      let result;
      
      if (tool.name === 'check_client_availability') {
        const proposedDate = parseTimeSlot(tool.params.time);
        if (!proposedDate) {
          result = { available: false, error: 'Could not parse time' };
        } else {
          const endDate = new Date(proposedDate.getTime() + 60 * 60 * 1000);
          const availability = await checkAvailability(proposedDate, endDate);
          
          if (availability.available) {
            result = { 
              available: true, 
              slot: formatSlot(proposedDate),
              message: `${mockUser.name} is FREE at ${formatSlot(proposedDate)}`
            };
          } else {
            result = { 
              available: false, 
              conflict: availability.conflictingEvent?.title,
              message: `${mockUser.name} has a CONFLICT: "${availability.conflictingEvent?.title}"`
            };
          }
        }
      } else if (tool.name === 'book_appointment') {
        const appointmentDate = parseTimeSlot(tool.params.time);
        if (!appointmentDate) {
          result = { success: false, error: 'Invalid time' };
        } else {
          const endDate = new Date(appointmentDate.getTime() + 60 * 60 * 1000);
          const confirmationCode = tool.params.confirmationCode || 'UNKNOWN';
          
          const bookResult = await bookAppointment(
            `${mockProvider.service} at ${mockProvider.name}`,
            appointmentDate,
            endDate,
            mockProvider.name,
            confirmationCode
          );

          if (bookResult.success) {
            setBookingResult({ slot: appointmentDate, confirmationCode });
            toast({
              title: '🎉 Appointment Booked!',
              description: `${mockUser.name}'s appointment confirmed`,
            });
            result = { 
              success: true, 
              time: formatSlot(appointmentDate), 
              confirmationCode,
              message: `Booking CONFIRMED for ${mockUser.name} at ${formatSlot(appointmentDate)}`
            };
          } else {
            result = { success: false, error: bookResult.error };
          }
        }
      } else {
        result = { error: `Unknown tool: ${tool.name}` };
      }
      
      results.push({ name: tool.name, result });
    }
    
    return results;
  };

  const handleSendWithText = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    // Stop listening while processing
    if (isListening) {
      stopListening();
    }

    // User's message is from the "receptionist" perspective
    const receptionistMessage: Message = {
      id: Date.now().toString(),
      role: 'receptionist',
      content: textToSend.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, receptionistMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Build conversation history for the API
      const conversationHistory = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'agent' ? 'assistant' : 'user',
        content: m.content,
      }));

      // First call: Get agent's initial response
      const responseData = await ai.textChat({
        receptionistMessage: textToSend.trim(),
        provider: mockProvider,
        user: mockUser,
        conversationHistory,
      });

      let { agentResponse, toolCalls } = responseData;

      // If there are tool calls, execute them and get follow-up response
      if (toolCalls && toolCalls.length > 0) {
        console.log('Executing tool calls:', toolCalls);
        
        // Execute the tools
        const toolResults = await executeTools(toolCalls);
        console.log('Tool results:', toolResults);

        // Add tool execution as a system message
        const toolMessage: Message = {
          id: `tool-${Date.now()}`,
          role: 'system',
          content: `🔧 Checking ${mockUser.name}'s calendar...\n${toolResults.map(t => `${t.name}: ${t.result.message || JSON.stringify(t.result)}`).join('\n')}`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, toolMessage]);

        // Call the API again with tool results to get proper follow-up
        const followUpData = await ai.textChat({
          provider: mockProvider,
          user: mockUser,
          conversationHistory: [
            ...conversationHistory,
            { role: 'user', content: textToSend.trim() },
          ],
          toolResults,
        });

        if (followUpData) {
          agentResponse = followUpData.agentResponse;
        }
      }

      // Add agent's final response
      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        content: agentResponse,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, agentMessage]);

      // Speak the response if voice mode is enabled
      if (isVoiceEnabled) {
        speak(agentResponse);
      }

    } catch (error) {
      console.error('Chat error:', error);
      
      // Fallback response
      const fallbackMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'agent',
        content: `I see. Let me check if that works for my client's schedule...`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, fallbackMessage]);
      
      if (isVoiceEnabled) {
        speak(fallbackMessage.content);
      }
    } finally {
      setIsLoading(false);
      
      // Resume listening if voice mode is enabled
      if (isVoiceEnabled && !isSpeaking) {
        setTimeout(() => startListening(), 500);
      }
      
      inputRef.current?.focus();
    }
  };

  const handleSend = async () => {
    await handleSendWithText(input);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const resetConversation = () => {
    stopSpeaking();
    stopListening();
    initialSpokenRef.current = false;
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

  const handleVoiceModeToggle = (enabled: boolean) => {
    toggleVoiceMode(enabled);
    if (enabled) {
      // Speak initial message
      const initialAgentMessage = messages.find(m => m.role === 'agent');
      if (initialAgentMessage) {
        speak(initialAgentMessage.content);
      }
    }
  };

  // Start listening after AI finishes speaking
  useEffect(() => {
    if (isVoiceEnabled && !isSpeaking && !isLoading && !isListening) {
      const timer = setTimeout(() => {
        startListening();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isVoiceEnabled, isSpeaking, isLoading, isListening, startListening]);

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
          <div className="flex items-center gap-4">
            {/* Voice Mode Toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="voice-mode"
                checked={isVoiceEnabled}
                onCheckedChange={handleVoiceModeToggle}
              />
              <Label htmlFor="voice-mode" className="text-sm flex items-center gap-1">
                {isVoiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                Voice
              </Label>
            </div>
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
              Respond as a receptionist would. Offer appointment times, ask for details, confirm bookings with a code.
            </p>
            {isVoiceEnabled && (
              <div className="flex items-center gap-2 mt-2 p-2 bg-primary/10 rounded-lg">
                {isSpeaking ? (
                  <>
                    <Volume2 className="h-4 w-4 text-primary animate-pulse" />
                    <span className="text-xs text-primary">AI is speaking...</span>
                  </>
                ) : isListening ? (
                  <>
                    <Mic className="h-4 w-4 text-green-500 animate-pulse" />
                    <span className="text-xs text-green-500">Listening... {partialText && `"${partialText}"`}</span>
                  </>
                ) : (
                  <>
                    <MicOff className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Voice ready</span>
                  </>
                )}
              </div>
            )}
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
                <span className="text-sm text-muted-foreground">Agent is responding...</span>
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
            {isVoiceEnabled 
              ? "Voice mode: Just speak your response when listening" 
              : "You're the receptionist. Respond to the AI agent's booking request."}
          </p>
          <div className="flex gap-2">
            {isVoiceEnabled ? (
              <>
                <Button 
                  variant={isListening ? "destructive" : "default"}
                  className="flex-1"
                  onClick={() => isListening ? stopListening() : startListening()}
                  disabled={isSpeaking || isLoading}
                >
                  {isListening ? (
                    <>
                      <MicOff className="h-4 w-4 mr-2" />
                      Stop Listening
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4 mr-2" />
                      {isSpeaking ? 'AI Speaking...' : 'Start Listening'}
                    </>
                  )}
                </Button>
                {isSpeaking && (
                  <Button variant="outline" onClick={stopSpeaking}>
                    <VolumeX className="h-4 w-4" />
                  </Button>
                )}
              </>
            ) : (
              <>
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="e.g., 'We have 2pm tomorrow available' or 'Confirmed! Code is AB1234'"
                  className="flex-1"
                  disabled={isLoading}
                />
                <Button onClick={handleSend} disabled={!input.trim() || isLoading}>
                  <Send className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
