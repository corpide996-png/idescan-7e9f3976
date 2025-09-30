import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Building2, MapPin, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ScanResult {
  id: string;
  title: string;
  owner: string | null;
  country: string | null;
  similarity_score: number;
  source_type: string | null;
  legal_status: string | null;
  snippet: string | null;
  url: string | null;
}

interface ScanResultsProps {
  scanId: string;
}

export function ScanResults({ scanId }: ScanResultsProps) {
  const [results, setResults] = useState<ScanResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchResults();
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel('scan-results-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'scan_results',
          filter: `scan_id=eq.${scanId}`
        },
        (payload) => {
          setResults(prev => [...prev, payload.new as ScanResult]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [scanId]);

  const fetchResults = async () => {
    try {
      const { data, error } = await supabase
        .from('scan_results')
        .select('*')
        .eq('scan_id', scanId)
        .order('similarity_score', { ascending: false });

      if (error) throw error;
      setResults(data || []);
    } catch (error) {
      console.error('Error fetching results:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getSimilarityColor = (score: number) => {
    if (score >= 85) return "bg-destructive text-destructive-foreground";
    if (score >= 60) return "bg-warning text-warning-foreground";
    if (score >= 30) return "bg-info text-info-foreground";
    return "bg-muted text-muted-foreground";
  };

  const getSimilarityLabel = (score: number) => {
    if (score >= 85) return "Near Duplicate";
    if (score >= 60) return "Strong Similarity";
    if (score >= 30) return "Related";
    return "Distant";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="relative">
          <div className="w-24 h-24 border-4 border-primary/30 rounded-full"></div>
          <div className="absolute top-0 left-0 w-24 h-24 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-lg">
          No similar innovations found. Your idea might be unique!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          Found {results.length} Similar Innovation{results.length !== 1 ? 's' : ''}
        </h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {results.map((result) => (
          <Card key={result.id} className="bg-gradient-card border-border hover:border-primary/50 transition-all hover:shadow-elegant animate-fade-in">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg line-clamp-2">{result.title}</CardTitle>
                <Badge className={`${getSimilarityColor(result.similarity_score)} shrink-0`}>
                  {result.similarity_score}%
                </Badge>
              </div>
              <Badge variant="outline" className="w-fit">
                {getSimilarityLabel(result.similarity_score)}
              </Badge>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {result.snippet && (
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {result.snippet}
                </p>
              )}
              
              <div className="space-y-2 text-sm">
                {result.owner && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="w-4 h-4" />
                    <span>{result.owner}</span>
                  </div>
                )}
                
                {result.country && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    <span>{result.country}</span>
                  </div>
                )}
                
                {result.legal_status && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Shield className="w-4 h-4" />
                    <span>{result.legal_status}</span>
                  </div>
                )}
              </div>

              {result.source_type && (
                <Badge variant="secondary" className="capitalize">
                  {result.source_type}
                </Badge>
              )}

              {result.url && (
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-accent hover:text-accent-glow transition-colors"
                >
                  View Details
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
