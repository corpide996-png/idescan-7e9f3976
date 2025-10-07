import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Building2, MapPin, Shield, User, Linkedin, Twitter, Mail, Lock } from "lucide-react";
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
  const [hasSubscription, setHasSubscription] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(true);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchResults();
    checkScanStatus();
    checkUserSubscription();

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
    
    // Re-check subscription when page becomes visible (after payment)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkUserSubscription();
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
          table: 'user_subscriptions'
        },
        () => {
          // Re-check subscription when subscriptions table changes
          checkUserSubscription();
        }
      )
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [scanId]);

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
        body: { reference },
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
        
        // Immediately update subscription state with unlock animation
        setJustUnlocked(true);
        setHasSubscription(true);
        setCheckingSubscription(false);
        
        // Show success toast immediately
        toast({
          title: "🎉 Payment Successful!",
          description: "Unlocking all founder details now...",
        });
        
        // Reset animation flag after animation completes
        setTimeout(() => {
          setJustUnlocked(false);
          console.log('Unlock animation complete');
        }, 3000);
        
        // Also refresh from database to ensure consistency
        await checkUserSubscription();
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

  const checkUserSubscription = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCheckingSubscription(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('expires_at')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking subscription:', error);
      }

      const isActive = data && new Date(data.expires_at) > new Date();
      setHasSubscription(!!isActive);
      setCheckingSubscription(false);
    } catch (error) {
      console.error('Error checking subscription:', error);
      setCheckingSubscription(false);
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

              {hasSubscription ? (
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
                      <DialogDescription>{result.snippet}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      {result.founder_name ? (
                        <>
                          <div className="flex items-start gap-3">
                            <User className="w-5 h-5 mt-1 text-muted-foreground" />
                            <div>
                              <p className="font-semibold">Founder/Inventor</p>
                              <p className="text-sm text-muted-foreground">{result.founder_name}</p>
                            </div>
                          </div>
                          {result.founder_country && (
                            <div className="flex items-start gap-3">
                              <MapPin className="w-5 h-5 mt-1 text-muted-foreground" />
                              <div>
                                <p className="font-semibold">Country of Origin</p>
                                <p className="text-sm text-muted-foreground">{result.founder_country}</p>
                              </div>
                            </div>
                          )}
                          {result.founder_social_media && Object.keys(result.founder_social_media).length > 0 && (
                            <div className="space-y-2">
                              <p className="font-semibold">Social Media</p>
                              <div className="flex flex-col gap-2">
                                {result.founder_social_media.linkedin && (
                                  <a
                                    href={result.founder_social_media.linkedin}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-2 text-sm text-primary hover:underline"
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
                                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                                  >
                                    <Twitter className="w-4 h-4" />
                                    Twitter/X Profile
                                  </a>
                                )}
                                {result.founder_social_media.email && (
                                  <a
                                    href={`mailto:${result.founder_social_media.email}`}
                                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                                  >
                                    <Mail className="w-4 h-4" />
                                    {result.founder_social_media.email}
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">Founder information not available for this result.</p>
                      )}
                      {result.url && (
                        <div className="pt-4 border-t">
                          <a
                            href={result.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline flex items-center gap-2"
                          >
                            Visit Official Source
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              ) : (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="flex items-center gap-2 text-sm">
                      <Lock className="w-4 h-4" />
                      Unlock Details
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Unlock Founder Details</DialogTitle>
                      <DialogDescription>
                        Get access to founder information, social media handles, and contact details for 7 days.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="bg-muted p-4 rounded-lg space-y-2">
                        <p className="text-sm font-semibold">What you'll get:</p>
                        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                          <li>Founder/Inventor names</li>
                          <li>Country of origin</li>
                          <li>LinkedIn profiles</li>
                          <li>Twitter/X handles</li>
                          <li>Email addresses</li>
                          <li>7 days unlimited access</li>
                        </ul>
                      </div>
                      <Button 
                        className="w-full" 
                        onClick={handlePayment}
                        disabled={isProcessingPayment}
                      >
                        {isProcessingPayment ? 'Processing...' : 'Pay to Unlock (5 KSH)'}
                        {!isProcessingPayment && <ExternalLink className="w-4 h-4 ml-2" />}
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        Complete payment to get 7 days unlimited access
                      </p>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
