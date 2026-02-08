import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Phone, PhoneCall, PhoneOff, Loader2, Mic, Volume2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TranscriptEntry {
  speaker: "ai" | "user";
  text: string;
  timestamp: number;
}

export default function VoiceTest() {
  const [phoneNumber, setPhoneNumber] = useState("+447459823042");
  const [callStatus, setCallStatus] = useState<"idle" | "calling" | "connected" | "ended" | "error">("idle");
  const [callSid, setCallSid] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Subscribe to realtime transcript updates when we have a callSid
  useEffect(() => {
    if (!callSid) return;

    console.log("Subscribing to call channel:", callSid);
    
    const channel = supabase
      .channel(`call:${callSid}`)
      .on("broadcast", { event: "transcript" }, (payload) => {
        console.log("Received transcript:", payload);
        const { speaker, text, timestamp } = payload.payload;
        setTranscript((prev) => [...prev, { speaker, text, timestamp }]);
      })
      .subscribe((status) => {
        console.log("Channel subscription status:", status);
      });

    return () => {
      console.log("Unsubscribing from call channel");
      supabase.removeChannel(channel);
    };
  }, [callSid]);

  // Auto-scroll to bottom when new transcript entries arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  const initiateCall = async () => {
    setIsLoading(true);
    setError(null);
    setTranscript([]);
    setCallStatus("calling");

    try {
      const { data, error } = await supabase.functions.invoke("twilio-test-call", {
        body: {
          toNumber: phoneNumber,
          providerName: "Test Voice Assistant",
          service: "voice testing",
          userName: "Test User",
          purpose: "testing",
          details: "This is a test call to verify the voice pipeline",
          timePreference: "now",
        },
      });

      if (error) throw error;

      if (data?.success) {
        setCallSid(data.callSid);
        setCallStatus("connected");
        console.log("Call initiated:", data);
        
        // Clear transcript and add status message
        setTranscript([
          {
            speaker: "ai",
            text: "📞 Call connected! Listening for audio...",
            timestamp: Date.now(),
          },
        ]);
      } else {
        throw new Error(data?.error || "Failed to initiate call");
      }
    } catch (err) {
      console.error("Call error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setCallStatus("error");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = () => {
    switch (callStatus) {
      case "idle":
        return <Phone className="h-6 w-6" />;
      case "calling":
        return <Loader2 className="h-6 w-6 animate-spin" />;
      case "connected":
        return <PhoneCall className="h-6 w-6 text-green-500 animate-pulse" />;
      case "ended":
        return <PhoneOff className="h-6 w-6 text-muted-foreground" />;
      case "error":
        return <PhoneOff className="h-6 w-6 text-destructive" />;
    }
  };

  const getStatusText = () => {
    switch (callStatus) {
      case "idle":
        return "Ready to call";
      case "calling":
        return "Initiating call...";
      case "connected":
        return "Call in progress - answer your phone!";
      case "ended":
        return "Call ended";
      case "error":
        return "Call failed";
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">🎤 Voice Pipeline Test</h1>
          <p className="text-muted-foreground">
            Test the AI voice calling system end-to-end
          </p>
        </div>

        {/* Call Control Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon()}
              {getStatusText()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                type="tel"
                placeholder="+1234567890"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={callStatus === "calling" || callStatus === "connected"}
              />
              <Button
                onClick={initiateCall}
                disabled={isLoading || callStatus === "connected" || !phoneNumber}
                className="min-w-[120px]"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Phone className="h-4 w-4 mr-2" />
                    Call Me
                  </>
                )}
              </Button>
            </div>

            {callSid && (
              <p className="text-xs text-muted-foreground font-mono">
                Call SID: {callSid}
              </p>
            )}

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live Transcript Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="h-5 w-5" />
                Live Transcript
                {callStatus === "connected" && (
                  <span className="flex items-center gap-1 text-xs text-green-500 font-normal">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    Live
                  </span>
                )}
              </div>
              {transcript.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTranscript([])}
                  className="text-muted-foreground"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {transcript.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Volume2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Transcript will appear here during the call</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] pr-4" ref={scrollRef}>
                <div className="space-y-3">
                  {transcript.map((entry, index) => (
                    <div
                      key={index}
                      className={`flex gap-3 ${
                        entry.speaker === "ai" ? "justify-start" : "justify-end"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] p-3 rounded-lg ${
                          entry.speaker === "ai"
                            ? "bg-primary/10 text-foreground"
                            : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        <p className="text-xs font-semibold mb-1 opacity-70">
                          {entry.speaker === "ai" ? "🤖 AI Assistant" : "👤 You"}
                        </p>
                        <p className="text-sm">{entry.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-2">How it works:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>Enter your phone number and click "Call Me"</li>
              <li>You'll receive a call from the Twilio number</li>
              <li>When you answer, the AI assistant will speak</li>
              <li>Talk back and the AI will respond in real-time</li>
              <li>The transcript will appear here (once connected to media stream)</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
