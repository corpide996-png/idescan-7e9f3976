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
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { scanId } = await req.json();
    
    if (!scanId) {
      throw new Error('scanId is required');
    }

    console.log('Processing scan:', scanId);

    // Get scan details
    const { data: scan, error: scanError } = await supabase
      .from('scans')
      .select('*')
      .eq('id', scanId)
      .single();

    if (scanError || !scan) {
      throw new Error('Scan not found');
    }

    // Use Lovable AI to analyze the idea
    const analysisPrompt = `Analyze this business idea and provide detailed market insights:

Idea: ${scan.text_input}

Provide a comprehensive analysis including:
1. Similarity scores (0-100) for these categories: tech, fashion, health, agriculture, arts
2. Market performance insights (trend, growth rate, market size)
3. Top 3 best locations where this idea would perform well (with scores and reasons)
4. Top 3 best sectors/industries for this idea (with scores and potential)
5. AI simulation predicting market success with timeline, risks, and opportunities

Return the analysis in JSON format with this exact structure:
{
  "tech_score": number,
  "fashion_score": number,
  "health_score": number,
  "agriculture_score": number,
  "arts_score": number,
  "market_performance": {
    "trend": "growing" | "stable" | "declining",
    "growth_rate": number,
    "market_size": "small" | "medium" | "large" | "huge"
  },
  "best_locations": [
    {"location": "string", "score": number, "reason": "string"}
  ],
  "best_sectors": [
    {"sector": "string", "score": number, "potential": "string"}
  ],
  "simulation_data": {
    "predicted_success": number,
    "timeline": [
      {"month": number, "revenue": number, "users": number}
    ],
    "risks": ["string"],
    "opportunities": ["string"]
  }
}`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a market analysis expert. Provide detailed, realistic business insights in JSON format.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        response_format: { type: 'json_object' }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error('Failed to analyze idea with AI');
    }

    const aiData = await aiResponse.json();
    const analysisContent = aiData.choices[0].message.content;
    
    let analysis;
    try {
      analysis = JSON.parse(analysisContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', analysisContent);
      throw new Error('Invalid AI response format');
    }

    console.log('AI Analysis:', analysis);

    // Insert results into database
    const { error: insertError } = await supabase
      .from('scan_results')
      .insert({
        scan_id: scanId,
        tech_score: analysis.tech_score,
        fashion_score: analysis.fashion_score,
        health_score: analysis.health_score,
        agriculture_score: analysis.agriculture_score,
        arts_score: analysis.arts_score,
        market_performance: analysis.market_performance,
        best_locations: analysis.best_locations,
        best_sectors: analysis.best_sectors,
        simulation_data: analysis.simulation_data,
      });

    if (insertError) {
      console.error('Error inserting results:', insertError);
      throw insertError;
    }

    // Update scan status to completed
    await supabase
      .from('scans')
      .update({ status: 'completed' })
      .eq('id', scanId);

    console.log('Scan completed successfully');

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing scan:', error);
    
    // Try to update scan status to failed
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const body = await req.json().catch(() => ({}));
      const scanId = body.scanId;
      
      if (scanId) {
        await supabase
          .from('scans')
          .update({ status: 'failed' })
          .eq('id', scanId);
      }
    } catch (updateError) {
      console.error('Failed to update scan status:', updateError);
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
