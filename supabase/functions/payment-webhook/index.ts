import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Webhook received');
    
    // Parse the webhook payload
    const payload = await req.json();
    console.log('Webhook payload:', JSON.stringify(payload, null, 2));

    // IntaSend webhook structure may vary, but typically includes:
    // - state/status: "COMPLETE" or "SUCCESS"
    // - customer email
    // - amount
    // - reference/invoice_id
    
    // Extract relevant data (adjust based on actual IntaSend webhook format)
    const state = payload.state || payload.status;
    const email = payload.email || payload.customer?.email || payload.customer_email;
    const amount = payload.amount || payload.value;
    const reference = payload.invoice_id || payload.reference || payload.id;

    console.log(`Payment state: ${state}, Email: ${email}, Amount: ${amount}, Reference: ${reference}`);

    // Only process successful payments
    if (state !== 'COMPLETE' && state !== 'SUCCESS' && state !== 'PAID') {
      console.log('Payment not successful, skipping');
      return new Response(
        JSON.stringify({ message: 'Payment not successful', state }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (!email) {
      console.error('No email found in webhook payload');
      return new Response(
        JSON.stringify({ error: 'No email found in payment data' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Find user by email
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (userError) {
      console.error('Error finding user:', userError);
      return new Response(
        JSON.stringify({ error: 'User not found', details: userError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    const userId = userData.id;
    console.log(`Found user ID: ${userId}`);

    // Calculate expiry date (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Insert or update subscription
    const { data: subscriptionData, error: subscriptionError } = await supabase
      .from('user_subscriptions')
      .upsert({
        user_id: userId,
        expires_at: expiresAt.toISOString(),
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (subscriptionError) {
      console.error('Error creating subscription:', subscriptionError);
      return new Response(
        JSON.stringify({ error: 'Failed to create subscription', details: subscriptionError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log(`Subscription created/updated for user ${userId}, expires at ${expiresAt.toISOString()}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Subscription activated',
        user_id: userId,
        expires_at: expiresAt.toISOString(),
        reference: reference
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error processing webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
