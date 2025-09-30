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
  const [scanStatus, setScanStatus] = useState<string>('processing');

  useEffect(() => {
    fetchResults();
    checkScanStatus();
    
    // Set a timeout to check for stalled scans
    const timeoutId = setTimeout(() => {
      checkScanStatus();
    }, 30000); // Check after 30 seconds
    
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
          setResults(prev => [...prev, payload.new as ScanResult].sort((a, b) => b.similarity_score - a.similarity_score));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scans',
          filter: `id=eq.${scanId}`
        },
        (payload) => {
          setScanStatus(payload.new.status);
          if (payload.new.status === 'completed') {
            setIsLoading(false);
          }
        }
      )
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, [scanId]);

  const checkScanStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('scans')
        .select('status')
        .eq('id', scanId)
        .single();

      if (error) throw error;
      setScanStatus(data.status);
      if (data.status === 'completed' || data.status === 'failed') {
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error checking scan status:', error);
    }
  };

  const fetchResults = async () => {
    try {
      const { data, error } = await supabase
        .from('scan_results')
        .select('*')
        .eq('scan_id', scanId)
        .order('similarity_score', { ascending: false });

      if (error) throw error;
      setResults(data || []);
      
      if (data && data.length > 0) {
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error fetching results:', error);
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

  if (isLoading || scanStatus === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-6">
        <div className="relative">
          <div className="w-24 h-24 border-4 border-primary/30 rounded-full"></div>
          <div className="absolute top-0 left-0 w-24 h-24 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-xl font-semibold">Scanning Innovation Databases</h3>
          <p className="text-muted-foreground">
            {results.length > 0 
              ? `Found ${results.length} similar innovations so far...` 
              : 'Searching USPTO, international patents, and startup databases...'}
          </p>
        </div>
        
        {/* Show partial results while loading */}
        {results.length > 0 && (
          <div className="w-full max-w-4xl">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 opacity-75">
              {results.slice(0, 3).map((result) => (
                <Card key={result.id} className="bg-gradient-card border-border animate-fade-in">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base line-clamp-2">{result.title}</CardTitle>
                      <Badge className={`${getSimilarityColor(result.similarity_score)} shrink-0`}>
                        {result.similarity_score}%
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (scanStatus === 'failed') {
    return (
      <div className="text-center py-12">
        <p className="text-destructive text-lg mb-4">
          Scan failed. Please try again.
        </p>
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
        <div>
          <h2 className="text-2xl font-bold">
            Found {results.length} Similar Innovation{results.length !== 1 ? 's' : ''}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Searched across USPTO, international patents, and global startups
          </p>
        </div>
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
