import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

/**
 * Twilio Media Streams WebSocket Handler
 * 
 * This handles real-time bidirectional audio:
 * 1. Receives μ-law audio from Twilio
 * 2. Converts to PCM for ElevenLabs STT
 * 3. Sends transcription to Lovable AI for response
 * 4. Converts AI response to speech via ElevenLabs TTS
 * 5. Streams μ-law audio back to Twilio
 */

const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

// μ-law to linear PCM conversion table
const ULAW_TO_LINEAR: number[] = [];
for (let i = 0; i < 256; i++) {
  let mu = ~i & 0xFF;
  let sign = mu & 0x80;
  let exponent = (mu >> 4) & 0x07;
  let mantissa = mu & 0x0F;
  let sample = ((mantissa << 3) + 0x84) << (exponent);
  sample -= 0x84;
  ULAW_TO_LINEAR[i] = sign ? -sample : sample;
}

// Linear PCM to μ-law conversion
function linearToMulaw(sample: number): number {
  const BIAS = 0x84;
  const MAX = 32635;
  
  let sign = (sample >> 8) & 0x80;
  if (sign) sample = -sample;
  if (sample > MAX) sample = MAX;
  
  sample += BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; exponent > 0 && (sample & expMask) === 0; exponent--, expMask >>= 1);
  
  let mantissa = (sample >> (exponent + 3)) & 0x0F;
  let mulaw = ~(sign | (exponent << 4) | mantissa) & 0xFF;
  return mulaw;
}

// Convert μ-law buffer to PCM 16-bit
function mulawToPcm(mulawData: Uint8Array): Int16Array {
  const pcm = new Int16Array(mulawData.length);
  for (let i = 0; i < mulawData.length; i++) {
    pcm[i] = ULAW_TO_LINEAR[mulawData[i]];
  }
  return pcm;
}

// Convert PCM 16-bit to μ-law
function pcmToMulaw(pcmData: Int16Array): Uint8Array {
  const mulaw = new Uint8Array(pcmData.length);
  for (let i = 0; i < pcmData.length; i++) {
    mulaw[i] = linearToMulaw(pcmData[i]);
  }
  return mulaw;
}

// Resample audio from one sample rate to another
function resample(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return input;
  
  const ratio = fromRate / toRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Int16Array(outputLength);
  
  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1);
    const fraction = srcIndex - srcIndexFloor;
    
    output[i] = Math.round(
      input[srcIndexFloor] * (1 - fraction) + input[srcIndexCeil] * fraction
    );
  }
  
  return output;
}

interface CallContext {
  streamSid: string;
  callSid: string;
  providerName: string;
  service: string;
  userName: string;
  purpose: string;
  details: string;
  timePreference: string;
  conversationHistory: Array<{ role: string; content: string }>;
  audioBuffer: Uint8Array[];
  isProcessing: boolean;
  silenceStart: number | null;
  lastActivityTime: number;
}

serve(async (req) => {
  // Handle WebSocket upgrade
  if (req.headers.get("upgrade") === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    const context: CallContext = {
      streamSid: "",
      callSid: "",
      providerName: "",
      service: "",
      userName: "",
      purpose: "",
      details: "",
      timePreference: "",
      conversationHistory: [],
      audioBuffer: [],
      isProcessing: false,
      silenceStart: null,
      lastActivityTime: Date.now(),
    };

    socket.onopen = () => {
      console.log("WebSocket connection opened");
    };

    socket.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        switch (msg.event) {
          case "connected":
            console.log("Twilio connected:", msg);
            break;
            
          case "start":
            console.log("Stream started:", msg);
            context.streamSid = msg.streamSid;
            context.callSid = msg.start?.callSid || "";
            
            // Extract custom parameters passed from TwiML
            const customParams = msg.start?.customParameters || {};
            context.providerName = customParams.providerName || "the business";
            context.service = customParams.service || "appointment";
            context.userName = customParams.userName || "a customer";
            context.purpose = customParams.purpose || "new_appointment";
            context.details = customParams.details || "";
            context.timePreference = customParams.timePreference || "flexible";
            
            console.log("Call context:", context);
            
            // Send initial greeting after a short delay
            setTimeout(async () => {
              await generateAndSendAudio(socket, context, true);
            }, 1000);
            break;
            
          case "media":
            // Accumulate audio data
            const audioData = Uint8Array.from(atob(msg.media.payload), c => c.charCodeAt(0));
            context.audioBuffer.push(audioData);
            context.lastActivityTime = Date.now();
            
            // Simple VAD: Process when we have ~2 seconds of audio or detect silence
            const totalSamples = context.audioBuffer.reduce((acc, buf) => acc + buf.length, 0);
            
            // Twilio sends μ-law at 8kHz, so 8000 samples = 1 second
            if (totalSamples >= 16000 && !context.isProcessing) {
              await processAudioAndRespond(socket, context);
            }
            break;
            
          case "stop":
            console.log("Stream stopped");
            break;
            
          case "mark":
            console.log("Mark received:", msg.mark?.name);
            break;
        }
      } catch (error) {
        console.error("Error handling message:", error);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    socket.onclose = () => {
      console.log("WebSocket connection closed");
    };

    return response;
  }

  // Regular HTTP request - return info
  return new Response(JSON.stringify({
    message: "Twilio Media Stream WebSocket endpoint",
    usage: "Connect via WebSocket with Twilio <Stream> element"
  }), {
    headers: { "Content-Type": "application/json" },
  });
});

async function processAudioAndRespond(socket: WebSocket, context: CallContext) {
  if (context.isProcessing || context.audioBuffer.length === 0) return;
  
  context.isProcessing = true;
  
  try {
    // Combine all audio buffers
    const totalLength = context.audioBuffer.reduce((acc, buf) => acc + buf.length, 0);
    const combinedAudio = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of context.audioBuffer) {
      combinedAudio.set(buf, offset);
      offset += buf.length;
    }
    context.audioBuffer = [];
    
    // Convert μ-law 8kHz to PCM 16kHz for ElevenLabs
    const pcm8k = mulawToPcm(combinedAudio);
    const pcm16k = resample(pcm8k, 8000, 16000);
    
    // Transcribe with ElevenLabs
    const transcription = await transcribeAudio(pcm16k);
    
    if (!transcription || transcription.trim().length < 2) {
      console.log("No meaningful transcription, waiting for more audio...");
      context.isProcessing = false;
      return;
    }
    
    console.log("Provider said:", transcription);
    
    // Add to conversation history
    context.conversationHistory.push({
      role: "user",
      content: transcription
    });
    
    // Generate AI response
    await generateAndSendAudio(socket, context, false);
    
  } catch (error) {
    console.error("Error processing audio:", error);
  } finally {
    context.isProcessing = false;
  }
}

async function transcribeAudio(pcmData: Int16Array): Promise<string> {
  // Create WAV file from PCM data
  const wavBuffer = createWav(pcmData, 16000);
  
  const formData = new FormData();
  formData.append("file", new Blob([wavBuffer], { type: "audio/wav" }), "audio.wav");
  formData.append("model_id", "scribe_v2");
  formData.append("language_code", "eng");
  
  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY!,
    },
    body: formData,
  });
  
  if (!response.ok) {
    console.error("STT error:", await response.text());
    return "";
  }
  
  const result = await response.json();
  return result.text || "";
}

async function generateAndSendAudio(socket: WebSocket, context: CallContext, isInitial: boolean) {
  try {
    // Generate AI message
    const aiMessage = await generateAIResponse(context, isInitial);
    console.log("AI says:", aiMessage);
    
    // Add to history
    context.conversationHistory.push({
      role: "assistant",
      content: aiMessage
    });
    
    // Convert to speech with ElevenLabs
    const audioBuffer = await textToSpeech(aiMessage);
    
    // Convert to μ-law 8kHz for Twilio
    const pcmData = await decodeMp3ToPcm(audioBuffer);
    const pcm8k = resample(pcmData, 22050, 8000); // ElevenLabs outputs at 22050Hz by default
    const mulawData = pcmToMulaw(pcm8k);
    
    // Send audio in chunks to Twilio
    const chunkSize = 640; // 80ms at 8kHz
    for (let i = 0; i < mulawData.length; i += chunkSize) {
      const chunk = mulawData.slice(i, Math.min(i + chunkSize, mulawData.length));
      const payload = base64Encode(chunk);
      
      socket.send(JSON.stringify({
        event: "media",
        streamSid: context.streamSid,
        media: {
          payload: payload
        }
      }));
      
      // Small delay between chunks to prevent buffer overflow
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Send mark to know when audio is done
    socket.send(JSON.stringify({
      event: "mark",
      streamSid: context.streamSid,
      mark: { name: "audio_complete" }
    }));
    
  } catch (error) {
    console.error("Error generating/sending audio:", error);
  }
}

async function generateAIResponse(context: CallContext, isInitial: boolean): Promise<string> {
  let systemPrompt: string;
  let userPrompt: string;
  
  if (isInitial) {
    systemPrompt = `You are an AI phone assistant making a call to book an appointment.
Generate the opening message for a call to ${context.providerName}.
Be polite, professional, and clearly state you're an AI calling on behalf of ${context.userName}.
Keep it concise (2-3 sentences max). Speak naturally as if on a phone call.`;
    
    userPrompt = `Generate opening for:
Service: ${context.service}
Purpose: ${context.purpose === 'new_appointment' ? 'Book new appointment' : context.purpose === 'reschedule' ? 'Reschedule' : 'General inquiry'}
Details: ${context.details || 'None'}
Time preference: ${context.timePreference || 'Flexible'}`;
  } else {
    systemPrompt = `You are an AI phone assistant in a live phone conversation to book an appointment at ${context.providerName}.
Based on what the receptionist/staff said, generate an appropriate reply.
If they offered a time slot, confirm it and ask for confirmation details.
If they asked a question, answer it based on the context.
If they can't help, thank them politely.
Keep responses concise (1-2 sentences). Be natural and conversational.`;
    
    const lastMessage = context.conversationHistory[context.conversationHistory.length - 1];
    userPrompt = `The receptionist said: "${lastMessage?.content || 'Hello?'}"
    
Service requested: ${context.service}
Time preference: ${context.timePreference || 'Flexible'}
Additional context: ${context.details || 'None'}

What should you say next?`;
  }
  
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        ...context.conversationHistory.slice(-6), // Keep last 6 messages for context
        { role: "user", content: userPrompt },
      ],
      max_tokens: 150,
      temperature: 0.7,
    }),
  });
  
  if (!response.ok) {
    console.error("AI error:", await response.text());
    return "I apologize, I'm having some technical difficulties. Could you please repeat that?";
  }
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "Could you please repeat that?";
}

async function textToSpeech(text: string): Promise<ArrayBuffer> {
  // Use a natural voice for phone calls
  const voiceId = "EXAVITQu4vr4xnSDxMaL"; // Sarah - natural conversational voice
  
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=pcm_22050`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5", // Low latency model
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    }
  );
  
  if (!response.ok) {
    console.error("TTS error:", await response.text());
    throw new Error("TTS failed");
  }
  
  return await response.arrayBuffer();
}

// Decode PCM data from ElevenLabs (raw PCM at 22050Hz)
async function decodeMp3ToPcm(buffer: ArrayBuffer): Promise<Int16Array> {
  // ElevenLabs with pcm_22050 returns raw PCM 16-bit signed little-endian
  const view = new DataView(buffer);
  const samples = new Int16Array(buffer.byteLength / 2);
  
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true); // little-endian
  }
  
  return samples;
}

// Create WAV file from PCM data
function createWav(pcmData: Int16Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length * 2;
  const headerSize = 44;
  
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);
  
  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  
  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // audio format (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  
  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  
  // Write PCM data
  for (let i = 0; i < pcmData.length; i++) {
    view.setInt16(headerSize + i * 2, pcmData[i], true);
  }
  
  return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
