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

    // Get Paystack secret key
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY');
    
    if (!paystackSecretKey) {
      throw new Error('Paystack API key not configured');
    }

    const webhookUrl = `${supabaseUrl}/functions/v1/payment-webhook`;
    const appUrl = supabaseUrl.replace('.supabase.co', '.lovableproject.com');

    // Create unique reference for this transaction
    const reference = `sub_${user.id}_${Date.now()}`;

    // Initialize Paystack transaction
    // Amount in kobo (smallest currency unit) - 200 KES = 20000 kobo
    const transactionData = {
      email: profile.email,
      amount: 20000, // 200 KES in kobo
      currency: 'KES',
      reference: reference,
      callback_url: appUrl,
      metadata: {
        user_id: user.id,
        full_name: profile.full_name || 'User',
        subscription_days: 7
      }
    };

    console.log('Creating Paystack transaction...');

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${paystackSecretKey}`,
      },
      body: JSON.stringify(transactionData),
    });

    if (!paystackResponse.ok) {
      const errorText = await paystackResponse.text();
      console.error('Paystack API error:', errorText);
      throw new Error(`Paystack API error: ${errorText}`);
    }

    const paymentResponse = await paystackResponse.json();
    console.log('Paystack transaction created:', paymentResponse);

    if (!paymentResponse.status || !paymentResponse.data?.authorization_url) {
      throw new Error('Invalid response from Paystack');
    }

    return new Response(
      JSON.stringify({
        success: true,
        payment_url: paymentResponse.data.authorization_url,
        payment_id: paymentResponse.data.reference,
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
