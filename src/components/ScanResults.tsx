import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Building2, MapPin, Shield, User, Linkedin, Twitter, Mail, Lock, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  founder_name: string | null;
  founder_country: string | null;
  founder_social_media: {
    linkedin?: string;
    twitter?: string;
    email?: string;
  } | null;
}

interface ScanResultsProps {
  scanId: string;
}

export function ScanResults({ scanId }: ScanResultsProps) {
  const [results, setResults] = useState<ScanResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [scanStatus, setScanStatus] = useState<string>('processing');
  const [scanUnlocked, setScanUnlocked] = useState(false);
  const [checkingUnlock, setCheckingUnlock] = useState(true);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchResults();
    checkScanStatus();
    checkScanUnlock();

    // Check for payment reference in URL (user returned from payment)
    const urlParams = new URLSearchParams(window.location.search);
    const paymentRef = urlParams.get('payment_ref');
    
    if (paymentRef) {
      console.log('Payment reference found in URL, verifying payment...');
      verifyPayment(paymentRef);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    // Set a timeout to check for stalled scans
    const timeoutId = setTimeout(() => {
      checkScanStatus();
    }, 30000); // Check after 30 seconds
    
    // Re-check unlock when page becomes visible (after payment)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkScanUnlock();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
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
          const newResult = {
            ...payload.new,
            founder_social_media: payload.new.founder_social_media as { linkedin?: string; twitter?: string; email?: string; } | null
          } as ScanResult;
          setResults(prev => [...prev, newResult].sort((a, b) => b.similarity_score - a.similarity_score));
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scan_unlocks'
        },
        () => {
          // Re-check unlock when scan_unlocks table changes
          checkScanUnlock();
        }
      )
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [scanId]);

  const checkScanUnlock = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setScanUnlocked(false);
        setCheckingUnlock(false);
        return;
      }

      const { data, error } = await supabase
        .from('scan_unlocks')
        .select('*')
        .eq('user_id', user.id)
        .eq('scan_id', scanId)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking scan unlock:', error);
      }

      setScanUnlocked(!!data);
      setCheckingUnlock(false);
    } catch (error) {
      console.error('Error checking scan unlock:', error);
      setScanUnlocked(false);
      setCheckingUnlock(false);
    }
  };

  const verifyPayment = async (reference: string) => {
    try {
      setIsProcessingPayment(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.error('No session found for payment verification');
        setIsProcessingPayment(false);
        return;
      }

      console.log('Verifying payment with reference:', reference);
      toast({
        title: "Verifying Payment",
        description: "Please wait while we verify your payment...",
      });

      const { data, error } = await supabase.functions.invoke('verify-payment', {
        body: { reference, scanId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Payment verification error:', error);
        toast({
          title: "Verification Failed",
          description: "Failed to verify payment. Please contact support.",
          variant: "destructive",
        });
        setIsProcessingPayment(false);
        return;
      }

      if (data?.success) {
        console.log('Payment verified successfully! Triggering unlock animation...');
        
        // Immediately update unlock state with animation
        setJustUnlocked(true);
        setScanUnlocked(true);
        setCheckingUnlock(false);
        
        // Show success toast immediately
        toast({
          title: "🎉 Payment Successful!",
          description: "This scan is now unlocked for 24 hours!",
        });
        
        // Reset animation flag after animation completes
        setTimeout(() => {
          setJustUnlocked(false);
          console.log('Unlock animation complete');
        }, 3000);
        
        // Also refresh from database to ensure consistency
        await checkScanUnlock();
      } else {
        toast({
          title: "Payment Not Confirmed",
          description: "Payment could not be verified. Please try again or contact support.",
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('Failed to verify payment:', error);
      toast({
        title: "Error",
        description: "Failed to verify payment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const handlePayment = async () => {
    try {
      setIsProcessingPayment(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentication Required",
          description: "Please log in to make a payment",
          variant: "destructive",
        });
        return;
      }

      console.log('Initiating payment...');
      
      const { data, error } = await supabase.functions.invoke('initiate-payment', {
        body: { scanId },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) {
        console.error('Payment initiation error:', error);
        toast({
          title: "Payment Error",
          description: "Failed to initiate payment. Please try again.",
          variant: "destructive",
        });
        return;
      }

      if (data?.payment_url) {
        console.log('Redirecting to payment URL:', data.payment_url);
        // Redirect to payment page - user will return with payment_ref
        window.location.href = data.payment_url;
      } else {
        toast({
          title: "Payment Error",
          description: "Failed to get payment URL",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast({
        title: "Error",
        description: "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingPayment(false);
    }
  };

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
      
      // Cast the data to our ScanResult type
      const typedResults = (data || []).map(item => ({
        ...item,
        founder_social_media: item.founder_social_media as { linkedin?: string; twitter?: string; email?: string; } | null
      })) as ScanResult[];
      
      setResults(typedResults);
      
      if (typedResults && typedResults.length > 0) {
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

  if (checkingUnlock) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">
            Found {results.length} Similar Innovation{results.length !== 1 ? 's' : ''}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Searched across USPTO, international patents, and global startups
          </p>
        </div>
        {!scanUnlocked && (
          <Button
            onClick={handlePayment}
            disabled={isProcessingPayment}
            className="bg-gradient-to-r from-primary to-accent hover:opacity-90"
          >
            {isProcessingPayment ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Lock className="mr-2 h-4 w-4" />
                Unlock Details (5 KES for 24h)
              </>
            )}
          </Button>
        )}
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

              {scanUnlocked ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button 
                      variant="link" 
                      className={`relative flex items-center gap-2 text-sm text-accent hover:text-accent-glow transition-all p-0 h-auto ${
                        justUnlocked ? 'animate-[scale-in_0.8s_ease-out] font-bold' : ''
                      }`}
                    >
                      {justUnlocked && (
                        <>
                          <span className="absolute -inset-4 bg-accent/30 rounded-lg animate-ping" />
                          <span className="absolute -inset-2 bg-accent/20 rounded-lg animate-pulse" />
                        </>
                      )}
                      <span className="relative flex items-center gap-2">
                        {justUnlocked ? '✨ View Details (Unlocked!)' : 'View Details'}
                        <ExternalLink className="w-4 h-4" />
                      </span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>{result.title}</DialogTitle>
                      <DialogDescription>Complete details about this innovation</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      {result.snippet && (
                        <div>
                          <h4 className="font-semibold mb-2">Description</h4>
                          <p className="text-sm text-muted-foreground">{result.snippet}</p>
                        </div>
                      )}
                      
                      {result.founder_name && (
                        <div className="space-y-2">
                          <h4 className="font-semibold">Founder Information</h4>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            <span>{result.founder_name}</span>
                          </div>
                          {result.founder_country && (
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4" />
                              <span>{result.founder_country}</span>
                            </div>
                          )}
                          
                          {result.founder_social_media && (
                            <div className="space-y-2 mt-4">
                              <h5 className="text-sm font-semibold">Contact Information</h5>
                              {result.founder_social_media.linkedin && (
                                <a 
                                  href={result.founder_social_media.linkedin}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-sm text-accent hover:text-accent-glow"
                                >
                                  <Linkedin className="w-4 h-4" />
                                  LinkedIn Profile
                                </a>
                              )}
                              {result.founder_social_media.twitter && (
                                <a 
                                  href={result.founder_social_media.twitter}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-sm text-accent hover:text-accent-glow"
                                >
                                  <Twitter className="w-4 h-4" />
                                  Twitter Profile
                                </a>
                              )}
                              {result.founder_social_media.email && (
                                <a 
                                  href={`mailto:${result.founder_social_media.email}`}
                                  className="flex items-center gap-2 text-sm text-accent hover:text-accent-glow"
                                >
                                  <Mail className="w-4 h-4" />
                                  {result.founder_social_media.email}
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {result.url && (
                        <a 
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-accent hover:text-accent-glow"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View Source
                        </a>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              ) : (
                <Button 
                  onClick={handlePayment}
                  disabled={isProcessingPayment}
                  variant="link"
                  className="p-0 h-auto text-muted-foreground"
                >
                  <Lock className="w-4 h-4 mr-2" />
                  Locked - Pay 5 KES to unlock
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Unlock Details Dialog */}
      <Dialog>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Unlock This Scan's Details
            </DialogTitle>
            <DialogDescription className="text-base text-muted-foreground">
              Pay 5 KES to unlock all founder information for this scan for 24 hours
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-primary/10 to-accent/10 p-6 rounded-lg border border-primary/20">
              <div className="flex items-center justify-between mb-4">
                <span className="text-lg font-semibold">24-Hour Access</span>
                <span className="text-3xl font-bold text-primary">5 KES</span>
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                  <span>Unlock all founder details for this specific scan</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                  <span>Access remains active for 24 hours</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                  <span>View contact information, social media, and more</span>
                </li>
              </ul>
            </div>

            <Button 
              onClick={handlePayment}
              disabled={isProcessingPayment}
              className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity"
            >
              {isProcessingPayment ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Lock className="mr-2 h-5 w-5" />
                  Unlock for 5 KES
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}