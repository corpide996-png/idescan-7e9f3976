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
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY')!;
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

    // Get payment reference and scanId from request body
    const { reference, scanId } = await req.json();
    
    if (!reference) {
      throw new Error('Payment reference is required');
    }

    if (!scanId) {
      throw new Error('Scan ID is required');
    }

    console.log(`Verifying payment for reference: ${reference}`);

    // Verify the transaction with Paystack
    const verifyResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
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
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Payment not successful',
          status: verificationData.data?.status 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Payment is successful, unlock this specific scan for 24 hours
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const { data: unlockData, error: unlockError } = await supabase
      .from('scan_unlocks')
      .upsert({
        user_id: user.id,
        scan_id: scanId,
        expires_at: expiresAt.toISOString(),
      }, {
        onConflict: 'user_id,scan_id'
      })
      .select()
      .single();

    if (unlockError) {
      console.error('Error unlocking scan:', unlockError);
      throw new Error('Failed to unlock scan');
    }

    console.log(`Scan ${scanId} unlocked for user ${user.id}, expires at ${expiresAt.toISOString()}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Scan unlocked successfully',
        expires_at: expiresAt.toISOString(),
        scan_id: scanId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error verifying payment:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }
});
