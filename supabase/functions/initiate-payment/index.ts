import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log('Initiating payment for user:', user.id);

    // Get user profile for email
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', user.id)
      .single();

    if (!profile?.email) {
      throw new Error('User email not found');
    }

    // Create IntaSend payment collection request
    const intasendSecretKey = Deno.env.get('INTASEND_SECRET_KEY');
    const intasendPublishableKey = Deno.env.get('INTASEND_PUBLISHABLE_KEY');
    
    if (!intasendSecretKey || !intasendPublishableKey) {
      throw new Error('IntaSend API keys not configured');
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/payment-webhook`;

    // Create payment request
    const paymentData = {
      public_key: intasendPublishableKey,
      amount: 10, // 10 KES - adjust as needed
      currency: 'KES',
      email: profile.email,
      first_name: profile.full_name?.split(' ')[0] || 'User',
      last_name: profile.full_name?.split(' ').slice(1).join(' ') || '',
      api_ref: `subscription_${user.id}_${Date.now()}`,
      webhook_url: webhookUrl,
    };

    console.log('Creating IntaSend payment collection...');

    const intasendResponse = await fetch('https://payment.intasend.com/api/v1/payment/collection/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${intasendSecretKey}`,
      },
      body: JSON.stringify(paymentData),
    });

    if (!intasendResponse.ok) {
      const errorText = await intasendResponse.text();
      console.error('IntaSend API error:', errorText);
      throw new Error(`IntaSend API error: ${errorText}`);
    }

    const paymentResponse = await intasendResponse.json();
    console.log('Payment collection created:', paymentResponse);

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: paymentResponse.url,
        payment_id: paymentResponse.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error initiating payment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});
