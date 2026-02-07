import { useState, useCallback } from "react";
import { useConversation } from "@elevenlabs/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mic, MicOff, Volume2, Loader2, MessageSquare, Settings } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TranscriptEntry {
  speaker: "ai" | "user";
  text: string;
  timestamp: number;
}

export default function VoiceAgentTest() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [agentId, setAgentId] = useState("");

  const conversation = useConversation({
    onConnect: () => {
      console.log("Connected to ElevenLabs agent");
      toast.success("Connected! Start speaking...");
      setTranscript([{
        speaker: "ai",
        text: "🎤 Connected! I'm listening...",
        timestamp: Date.now(),
      }]);
    },
    onDisconnect: () => {
      console.log("Disconnected from agent");
      toast.info("Conversation ended");
    },
    onMessage: (message) => {
      console.log("Message received:", message);
      
      // Handle different message types - cast to any for flexible message handling
      const msg = message as any;
      if (msg.type === "user_transcript") {
        const userText = msg.user_transcription_event?.user_transcript;
        if (userText) {
          setTranscript(prev => [...prev, {
            speaker: "user",
            text: userText,
            timestamp: Date.now(),
          }]);
        }
      } else if (msg.type === "agent_response") {
        const agentText = msg.agent_response_event?.agent_response;
        if (agentText) {
          setTranscript(prev => [...prev, {
            speaker: "ai",
            text: agentText,
            timestamp: Date.now(),
          }]);
        }
      }
    },
    onError: (error) => {
      console.error("Conversation error:", error);
      toast.error("Connection error. Please try again.");
    },
  });

  const startConversation = useCallback(async () => {
    if (!agentId.trim()) {
      toast.error("Please enter your ElevenLabs Agent ID");
      return;
    }

    setIsConnecting(true);
    setTranscript([]);

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get signed URL from edge function
      const { data, error } = await supabase.functions.invoke("elevenlabs-conversation-token", {
        body: { agentId: agentId.trim() },
      });

      if (error) throw error;

      if (!data?.signed_url) {
        throw new Error("No signed URL received");
      }

      // Start the conversation with WebSocket
      await conversation.startSession({
        signedUrl: data.signed_url,
      });
    } catch (error) {
      console.error("Failed to start conversation:", error);
      toast.error(error instanceof Error ? error.message : "Failed to connect");
    } finally {
      setIsConnecting(false);
    }
  }, [conversation, agentId]);

  const stopConversation = useCallback(async () => {
    await conversation.endSession();
  }, [conversation]);

  const getStatusColor = () => {
    switch (conversation.status) {
      case "connected":
        return "bg-green-500";
      default:
        return "bg-muted";
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">🎙️ ElevenLabs Voice Agent</h1>
          <p className="text-muted-foreground">
            Real-time AI conversation with natural speech
          </p>
        </div>

        {/* Agent Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Agent Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agentId">ElevenLabs Agent ID</Label>
              <Input
                id="agentId"
                placeholder="Enter your agent ID from ElevenLabs"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                disabled={conversation.status === "connected"}
              />
              <p className="text-xs text-muted-foreground">
                Create an agent at{" "}
                <a 
                  href="https://elevenlabs.io/conversational-ai" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  elevenlabs.io/conversational-ai
                </a>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Call Control */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${getStatusColor()} ${conversation.status === "connected" ? "animate-pulse" : ""}`} />
              {conversation.status === "connected" ? "Live Conversation" : "Ready to Connect"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {conversation.status === "disconnected" ? (
                <Button
                  onClick={startConversation}
                  disabled={isConnecting || !agentId.trim()}
                  className="flex-1"
                  size="lg"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Mic className="h-5 w-5 mr-2" />
                      Start Conversation
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={stopConversation}
                  variant="destructive"
                  className="flex-1"
                  size="lg"
                >
                  <MicOff className="h-5 w-5 mr-2" />
                  End Conversation
                </Button>
              )}
            </div>

            {conversation.status === "connected" && (
              <div className="flex items-center justify-center gap-4 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <Mic className={`h-4 w-4 ${!conversation.isSpeaking ? "text-green-500" : "text-muted-foreground"}`} />
                  <span className={!conversation.isSpeaking ? "text-green-500" : "text-muted-foreground"}>
                    {!conversation.isSpeaking ? "Listening..." : "Waiting"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Volume2 className={`h-4 w-4 ${conversation.isSpeaking ? "text-blue-500" : "text-muted-foreground"}`} />
                  <span className={conversation.isSpeaking ? "text-blue-500" : "text-muted-foreground"}>
                    {conversation.isSpeaking ? "Speaking..." : "Silent"}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Transcript */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Transcript
              {conversation.status === "connected" && (
                <span className="flex items-center gap-1 text-xs text-green-500 font-normal ml-auto">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Live
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {transcript.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Conversation will appear here</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] pr-4">
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
                          {entry.speaker === "ai" ? "🤖 AI Agent" : "👤 You"}
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
              <li>Create a conversational AI agent at ElevenLabs</li>
              <li>Copy your Agent ID and paste it above</li>
              <li>Click "Start Conversation" and allow microphone access</li>
              <li>Speak naturally - the AI will respond in real-time</li>
              <li>Interrupt anytime - it handles natural conversation flow</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
