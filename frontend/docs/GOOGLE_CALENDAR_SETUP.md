# Google Calendar OAuth Integration Guide

This guide documents how to implement real Google Calendar integration to replace the mock calendar.

## Overview

The integration uses OAuth 2.0 authorization code flow with:
- Server-side token exchange (keeps client_secret secure)
- Refresh token storage for long-term access
- Gateway URL for API calls: `https://gateway.lovable.dev/google_calendar/calendar/v3`

---

## Step 1: Google Cloud Console Setup

### 1.1 Create a Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Name it (e.g., "Booking App") and create

### 1.2 Enable Calendar API

1. Go to **APIs & Services** → **Library**
2. Search for "Google Calendar API"
3. Click **Enable**

### 1.3 Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (unless using Google Workspace)
3. Fill in required fields:
   - App name
   - User support email
   - Developer contact email
4. Add scopes:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events`
5. Add test users (your email) while in testing mode

### 1.4 Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Add Authorized redirect URIs:
   ```
   https://your-preview-url.lovable.app/auth/google/callback
   https://your-published-url.lovable.app/auth/google/callback
   ```
5. Save your **Client ID** and **Client Secret**

---

## Step 2: Database Setup

Run this migration to store OAuth tokens:

```sql
-- Create table for OAuth tokens
CREATE TABLE public.oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL DEFAULT 'google_calendar',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only access their own tokens
CREATE POLICY "Users can view own tokens"
  ON public.oauth_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tokens"
  ON public.oauth_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tokens"
  ON public.oauth_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tokens"
  ON public.oauth_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_oauth_tokens_updated_at
  BEFORE UPDATE ON public.oauth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add calendar_connected to profiles if not exists
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS calendar_connected BOOLEAN DEFAULT false;
```

---

## Step 3: Add Secrets

Add these secrets to your project:

- `GOOGLE_CLIENT_ID` - From Google Cloud Console
- `GOOGLE_CLIENT_SECRET` - From Google Cloud Console

---

## Step 4: Edge Functions

### 4.1 Token Exchange Function

Create `supabase/functions/google-calendar-auth/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
  const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return new Response(
      JSON.stringify({ error: 'Google OAuth not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify user
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { code, redirectUri, action } = await req.json();

    if (action === 'get_auth_url') {
      // Generate authorization URL
      const state = crypto.randomUUID();
      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events',
        access_type: 'offline',
        prompt: 'consent',
        state,
      });

      return new Response(
        JSON.stringify({ 
          auth_url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
          state 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'exchange_code') {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenResponse.json();

      if (!tokenResponse.ok) {
        throw new Error(tokens.error_description || 'Token exchange failed');
      }

      if (!tokens.refresh_token) {
        throw new Error('No refresh token received - user may need to revoke access and try again');
      }

      // Store tokens
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      
      const { error: upsertError } = await supabase
        .from('oauth_tokens')
        .upsert({
          user_id: user.id,
          provider: 'google_calendar',
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt,
        }, { onConflict: 'user_id,provider' });

      if (upsertError) {
        throw upsertError;
      }

      // Update profile
      await supabase
        .from('profiles')
        .update({ calendar_connected: true })
        .eq('user_id', user.id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'disconnect') {
      await supabase
        .from('oauth_tokens')
        .delete()
        .eq('user_id', user.id)
        .eq('provider', 'google_calendar');

      await supabase
        .from('profiles')
        .update({ calendar_connected: false })
        .eq('user_id', user.id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');
  } catch (error) {
    console.error('Google Calendar auth error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

### 4.2 Calendar API Function

Create `supabase/functions/google-calendar-api/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) throw new Error('Unauthorized');

    // Get valid access token (refresh if needed)
    const accessToken = await getValidAccessToken(supabase, user.id, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);

    const { action, ...params } = await req.json();

    if (action === 'list_events') {
      const { timeMin, timeMax } = params;
      const url = new URL(`${CALENDAR_API}/calendars/primary/events`);
      url.searchParams.set('timeMin', timeMin);
      url.searchParams.set('timeMax', timeMax);
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'check_availability') {
      const { startTime, endTime } = params;
      const url = new URL(`${CALENDAR_API}/calendars/primary/events`);
      url.searchParams.set('timeMin', startTime);
      url.searchParams.set('timeMax', endTime);
      url.searchParams.set('singleEvents', 'true');

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const data = await response.json();
      const hasConflict = data.items && data.items.length > 0;

      return new Response(
        JSON.stringify({ 
          available: !hasConflict,
          conflictingEvents: hasConflict ? data.items : []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'create_event') {
      const { summary, start, end, description } = params;

      const response = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary,
          description,
          start: { dateTime: start, timeZone: 'UTC' },
          end: { dateTime: end, timeZone: 'UTC' },
        }),
      });

      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Invalid action');
  } catch (error) {
    console.error('Calendar API error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getValidAccessToken(
  supabase: any,
  userId: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const { data: tokenData, error } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google_calendar')
    .single();

  if (error || !tokenData) {
    throw new Error('Calendar not connected');
  }

  const expiresAt = new Date(tokenData.expires_at);
  const bufferTime = 5 * 60 * 1000; // 5 minutes

  // Token still valid
  if (expiresAt.getTime() > Date.now() + bufferTime) {
    return tokenData.access_token;
  }

  // Refresh token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokenData.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const tokens = await response.json();

  if (!response.ok) {
    throw new Error('Token refresh failed - user needs to reconnect');
  }

  // Update stored token
  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  
  await supabase
    .from('oauth_tokens')
    .update({
      access_token: tokens.access_token,
      expires_at: newExpiresAt,
    })
    .eq('user_id', userId)
    .eq('provider', 'google_calendar');

  return tokens.access_token;
}
```

---

## Step 5: Client-Side Implementation

### 5.1 OAuth Hook

Create `src/hooks/useGoogleCalendar.ts`:

```typescript
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useGoogleCalendar() {
  const { profile, updateProfile } = useAuth();
  const [loading, setLoading] = useState(false);

  const connect = useCallback(async () => {
    setLoading(true);
    try {
      const redirectUri = `${window.location.origin}/auth/google/callback`;
      
      const { data, error } = await supabase.functions.invoke('google-calendar-auth', {
        body: { action: 'get_auth_url', redirectUri },
      });

      if (error) throw error;

      // Store state for CSRF validation
      sessionStorage.setItem('google_oauth_state', data.state);
      
      // Redirect to Google
      window.location.href = data.auth_url;
    } catch (error) {
      console.error('Failed to start OAuth:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCallback = useCallback(async (code: string, state: string) => {
    const storedState = sessionStorage.getItem('google_oauth_state');
    
    if (state !== storedState) {
      throw new Error('Invalid state - possible CSRF attack');
    }
    
    sessionStorage.removeItem('google_oauth_state');

    const redirectUri = `${window.location.origin}/auth/google/callback`;
    
    const { error } = await supabase.functions.invoke('google-calendar-auth', {
      body: { action: 'exchange_code', code, redirectUri },
    });

    if (error) throw error;

    await updateProfile({ calendar_connected: true });
  }, [updateProfile]);

  const disconnect = useCallback(async () => {
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('google-calendar-auth', {
        body: { action: 'disconnect' },
      });

      if (error) throw error;

      await updateProfile({ calendar_connected: false });
    } finally {
      setLoading(false);
    }
  }, [updateProfile]);

  const checkAvailability = useCallback(async (start: Date, end: Date) => {
    const { data, error } = await supabase.functions.invoke('google-calendar-api', {
      body: {
        action: 'check_availability',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });

    if (error) throw error;
    return data;
  }, []);

  const createEvent = useCallback(async (
    summary: string,
    start: Date,
    end: Date,
    description?: string
  ) => {
    const { data, error } = await supabase.functions.invoke('google-calendar-api', {
      body: {
        action: 'create_event',
        summary,
        start: start.toISOString(),
        end: end.toISOString(),
        description,
      },
    });

    if (error) throw error;
    return data;
  }, []);

  return {
    isConnected: profile?.calendar_connected ?? false,
    loading,
    connect,
    disconnect,
    handleCallback,
    checkAvailability,
    createEvent,
  };
}
```

### 5.2 Callback Route

Create `src/pages/auth/GoogleCallback.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { Loader2 } from 'lucide-react';

export default function GoogleCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleCallback } = useGoogleCalendar();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError('Authorization was denied');
      return;
    }

    if (code && state) {
      handleCallback(code, state)
        .then(() => navigate('/settings?calendar=connected'))
        .catch((err) => setError(err.message));
    }
  }, [searchParams, handleCallback, navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <button onClick={() => navigate('/settings')}>
            Return to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
      <span className="ml-2">Connecting Google Calendar...</span>
    </div>
  );
}
```

### 5.3 Add Route

In your router config:

```typescript
{
  path: '/auth/google/callback',
  element: <GoogleCallback />
}
```

---

## Step 6: Replace Mock Calendar in Agent

Update `useElevenLabsAgent.ts` to use real calendar:

```typescript
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';

// In the hook:
const { checkAvailability, createEvent, isConnected } = useGoogleCalendar();

const clientTools = {
  check_availability: async (params: { proposed_time: string }) => {
    if (!isConnected) {
      return JSON.stringify({ error: 'Calendar not connected' });
    }
    
    const start = parseTimeSlot(params.proposed_time);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    
    const result = await checkAvailability(start, end);
    return JSON.stringify(result);
  },
  
  confirm_booking: async (params) => {
    const result = await createEvent(
      `Appointment at ${provider.name}`,
      appointmentDate,
      endDate,
      `Confirmation: ${confirmationCode}`
    );
    return JSON.stringify({ success: true, event: result });
  },
};
```

---

## Troubleshooting

### No refresh token received
- User may have previously authorized without revoking
- Go to [Google Account Permissions](https://myaccount.google.com/permissions)
- Remove your app's access
- Try connecting again

### Token refresh fails
- Check that client_id and client_secret are correct
- Verify the refresh token is stored properly
- User may need to reconnect

### Calendar API errors
- Ensure Calendar API is enabled in Google Cloud Console
- Check that required scopes are configured
- Verify access token is valid

---

## Security Checklist

- [x] Client secret stored server-side only
- [x] State parameter validates CSRF
- [x] Tokens stored in database with RLS
- [x] Refresh tokens never exposed to client
- [x] Token refresh happens server-side
