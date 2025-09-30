import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { scanId } = await req.json();
    
    if (!scanId) {
      throw new Error('Scan ID is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch scan details
    const { data: scan, error: scanError } = await supabase
      .from('scans')
      .select('*')
      .eq('id', scanId)
      .single();

    if (scanError || !scan) {
      throw new Error('Scan not found');
    }

    console.log('Processing scan:', scanId);

    // Generate text embedding using Lovable AI
    const embeddingResponse = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-ada-002',
        input: scan.text_input
      })
    });

    if (!embeddingResponse.ok) {
      throw new Error('Failed to generate embedding');
    }

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.data[0].embedding;

    // Update scan with embedding
    await supabase
      .from('scans')
      .update({ text_embedding: embedding })
      .eq('id', scanId);

    // Mock results for demo (in production, this would query external APIs)
    const mockResults = [
      {
        scan_id: scanId,
        title: 'Smart Home Energy Management System',
        owner: 'TechCorp Inc.',
        country: 'United States',
        similarity_score: 87.5,
        source_type: 'patent',
        legal_status: 'Active',
        snippet: 'An intelligent system for optimizing household energy consumption using machine learning algorithms.',
        url: 'https://patents.google.com/patent/US123456'
      },
      {
        scan_id: scanId,
        title: 'AI-Powered Energy Optimizer',
        owner: 'GreenTech Solutions',
        country: 'Germany',
        similarity_score: 72.3,
        source_type: 'startup',
        legal_status: null,
        snippet: 'Startup developing AI solutions for residential energy management and cost reduction.',
        url: 'https://crunchbase.com/organization/greentech'
      },
      {
        scan_id: scanId,
        title: 'Automated Home Energy Control',
        owner: 'SmartHome Labs',
        country: 'Japan',
        similarity_score: 65.8,
        source_type: 'patent',
        legal_status: 'Pending',
        snippet: 'System for automatic control of home appliances based on energy consumption patterns.',
        url: 'https://patents.google.com/patent/JP987654'
      },
      {
        scan_id: scanId,
        title: 'Machine Learning for Energy Efficiency',
        owner: 'University Research',
        country: 'United Kingdom',
        similarity_score: 58.2,
        source_type: 'research',
        legal_status: null,
        snippet: 'Research paper on applying ML techniques to improve residential energy efficiency.',
        url: 'https://arxiv.org/abs/example'
      },
      {
        scan_id: scanId,
        title: 'IoT Energy Monitoring Platform',
        owner: 'EnergySave Inc.',
        country: 'Canada',
        similarity_score: 45.6,
        source_type: 'startup',
        legal_status: null,
        snippet: 'IoT-based platform for real-time energy monitoring and analytics.',
        url: 'https://energysave.com'
      }
    ];

    // Insert mock results
    const { error: resultsError } = await supabase
      .from('scan_results')
      .insert(mockResults);

    if (resultsError) {
      console.error('Error inserting results:', resultsError);
      throw resultsError;
    }

    // Update scan status to completed
    await supabase
      .from('scans')
      .update({ status: 'completed' })
      .eq('id', scanId);

    console.log('Scan completed successfully:', scanId);

    return new Response(
      JSON.stringify({ success: true, resultsCount: mockResults.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing scan:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
