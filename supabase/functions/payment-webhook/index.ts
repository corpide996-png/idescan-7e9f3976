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
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Paystack webhook received');
    
    // Parse the webhook payload
    const payload = await req.json();
    console.log('Webhook payload:', JSON.stringify(payload, null, 2));

    // Paystack webhook structure:
    // { event: "charge.success", data: { reference, amount, customer: { email }, status, ... } }
    
    const event = payload.event;
    const data = payload.data;

    // Only process successful charge events
    if (event !== 'charge.success') {
      console.log('Not a successful charge event, skipping');
      return new Response(
        JSON.stringify({ message: 'Event not processed', event }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (!data?.reference) {
      console.error('No reference found in webhook payload');
      return new Response(
        JSON.stringify({ error: 'No reference found in payment data' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Verify the transaction with Paystack
    console.log(`Verifying transaction: ${data.reference}`);
    const verifyResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${data.reference}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${paystackSecretKey}`,
        },
      }
    );

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      console.error('Paystack verification error:', errorText);
      throw new Error('Failed to verify transaction');
    }

    const verificationData = await verifyResponse.json();
    console.log('Verification response:', JSON.stringify(verificationData, null, 2));

    if (!verificationData.status || verificationData.data?.status !== 'success') {
      console.log('Transaction not successful');
      return new Response(
        JSON.stringify({ message: 'Transaction not successful' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const email = verificationData.data.customer?.email;
    const amount = verificationData.data.amount;

    if (!email) {
      console.error('No email found in verification data');
      return new Response(
        JSON.stringify({ error: 'No email found in payment data' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Processing payment: Email: ${email}, Amount: ${amount}`);

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
        reference: data.reference
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
