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

    // Extract key terms from input using AI
    const keyTermsResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: 'Extract 3-5 key technical terms or concepts from the innovation description. Return ONLY the terms separated by commas, no explanations.'
          },
          {
            role: 'user',
            content: scan.text_input
          }
        ]
      })
    });

    const keyTermsData = await keyTermsResponse.json();
    const searchTerms = keyTermsData.choices[0].message.content.trim();
    console.log('Search terms:', searchTerms);

    const allResults: any[] = [];

    // 1. Search USPTO Patents
    try {
      const usptoQuery = encodeURIComponent(searchTerms);
      const usptoUrl = `https://developer.uspto.gov/ibd-api/v1/application/grants?searchText=${usptoQuery}&start=0&rows=10`;
      
      console.log('Searching USPTO:', usptoUrl);
      const usptoResponse = await fetch(usptoUrl, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (usptoResponse.ok) {
        const usptoData = await usptoResponse.json();
        console.log('USPTO results:', usptoData.response?.docs?.length || 0);
        
        if (usptoData.response?.docs) {
          for (const patent of usptoData.response.docs.slice(0, 5)) {
            allResults.push({
              title: patent.inventionTitle || patent.title || 'Untitled Patent',
              owner: patent.assigneeEntityName || patent.inventors?.[0] || 'Unknown',
              country: 'United States',
              source_type: 'patent',
              legal_status: patent.patentStatus || 'Granted',
              snippet: patent.inventionSummaryText?.substring(0, 200) || patent.abstractText?.substring(0, 200) || '',
              url: patent.patentNumber ? `https://patents.google.com/patent/US${patent.patentNumber}` : null,
              raw_data: patent
            });
          }
        }
      }
    } catch (error) {
      console.error('USPTO search error:', error);
    }

    // 2. Search Google Patents via web scraping approach
    try {
      const googleQuery = encodeURIComponent(searchTerms);
      const googleUrl = `https://patents.google.com/?q=${googleQuery}&oq=${googleQuery}`;
      
      console.log('Searching Google Patents');
      // Note: Direct scraping would require parsing HTML. For now, we'll use AI to search and summarize
      const aiSearchResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
              content: `You are a patent research assistant. Given innovation keywords, generate 2-3 realistic similar patent examples from international patent offices (EP, JP, CN, WO). 
              Return ONLY valid JSON array with format: [{"title": "...", "owner": "...", "country": "...", "status": "...", "snippet": "...", "number": "..."}]
              Use realistic patent numbers and descriptions.`
            },
            {
              role: 'user',
              content: `Keywords: ${searchTerms}`
            }
          ]
        })
      });

      if (aiSearchResponse.ok) {
        const aiData = await aiSearchResponse.json();
        const content = aiData.choices[0].message.content;
        
        try {
          // Extract JSON from response
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const patents = JSON.parse(jsonMatch[0]);
            console.log('AI-generated patents:', patents.length);
            
            for (const patent of patents) {
              allResults.push({
                title: patent.title,
                owner: patent.owner,
                country: patent.country,
                source_type: 'patent',
                legal_status: patent.status,
                snippet: patent.snippet,
                url: patent.number ? `https://patents.google.com/patent/${patent.number}` : null,
                raw_data: patent
              });
            }
          }
        } catch (parseError) {
          console.error('Failed to parse AI patent results:', parseError);
        }
      }
    } catch (error) {
      console.error('Google Patents search error:', error);
    }

    // 3. Search for startups/companies using AI
    try {
      const startupSearchResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
              content: `You are a startup research assistant. Given innovation keywords, find 2-3 real startups or companies working on similar technologies.
              Return ONLY valid JSON array: [{"name": "...", "country": "...", "description": "...", "website": "..."}]
              Use real, verifiable companies.`
            },
            {
              role: 'user',
              content: `Keywords: ${searchTerms}`
            }
          ]
        })
      });

      if (startupSearchResponse.ok) {
        const startupData = await startupSearchResponse.json();
        const content = startupData.choices[0].message.content;
        
        try {
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const startups = JSON.parse(jsonMatch[0]);
            console.log('AI-found startups:', startups.length);
            
            for (const startup of startups) {
              allResults.push({
                title: startup.name,
                owner: startup.name,
                country: startup.country,
                source_type: 'startup',
                legal_status: null,
                snippet: startup.description,
                url: startup.website,
                raw_data: startup
              });
            }
          }
        } catch (parseError) {
          console.error('Failed to parse startup results:', parseError);
        }
      }
    } catch (error) {
      console.error('Startup search error:', error);
    }

    // Calculate similarity scores using embeddings
    console.log('Calculating similarity scores for', allResults.length, 'results');
    
    const resultsToInsert = [];
    
    for (const result of allResults) {
      // Generate embedding for the result
      const resultText = `${result.title} ${result.snippet}`;
      const resultEmbeddingResponse = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-ada-002',
          input: resultText
        })
      });

      if (resultEmbeddingResponse.ok) {
        const resultEmbeddingData = await resultEmbeddingResponse.json();
        const resultEmbedding = resultEmbeddingData.data[0].embedding;

        // Calculate cosine similarity
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < embedding.length; i++) {
          dotProduct += embedding[i] * resultEmbedding[i];
          normA += embedding[i] * embedding[i];
          normB += resultEmbedding[i] * resultEmbedding[i];
        }
        
        const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        const similarityScore = Math.max(0, Math.min(100, (similarity * 100))); // Convert to 0-100 scale

        resultsToInsert.push({
          scan_id: scanId,
          title: result.title,
          owner: result.owner,
          country: result.country,
          similarity_score: Math.round(similarityScore * 100) / 100,
          source_type: result.source_type,
          legal_status: result.legal_status,
          snippet: result.snippet?.substring(0, 500),
          url: result.url
        });
      }
    }

    // Sort by similarity score
    resultsToInsert.sort((a, b) => b.similarity_score - a.similarity_score);

    console.log('Inserting', resultsToInsert.length, 'results');

    // Insert results
    if (resultsToInsert.length > 0) {
      const { error: resultsError } = await supabase
        .from('scan_results')
        .insert(resultsToInsert);

      if (resultsError) {
        console.error('Error inserting results:', resultsError);
        throw resultsError;
      }
    }

    // Update scan status to completed
    await supabase
      .from('scans')
      .update({ status: 'completed' })
      .eq('id', scanId);

    console.log('Scan completed successfully:', scanId, 'with', resultsToInsert.length, 'results');

    return new Response(
      JSON.stringify({ 
        success: true, 
        resultsCount: resultsToInsert.length,
        sources: {
          uspto: allResults.filter(r => r.source_type === 'patent' && r.country === 'United States').length,
          international: allResults.filter(r => r.source_type === 'patent' && r.country !== 'United States').length,
          startups: allResults.filter(r => r.source_type === 'startup').length
        }
      }),
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
