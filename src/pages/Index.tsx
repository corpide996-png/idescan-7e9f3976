import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScanForm } from "@/components/ScanForm";
import { ScanResults } from "@/components/ScanResults";
import { ScanHistory } from "@/components/ScanHistory";
import { AuthDialog } from "@/components/AuthDialog";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, LogIn, LogOut, History, ScanSearch } from "lucide-react";
import heroBg from "@/assets/hero-bg.jpg";

const Index = () => {
  const [user, setUser] = useState<any>(null);
  const [currentScanId, setCurrentScanId] = useState<string | null>(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("scan");

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleScanStart = (scanId: string) => {
    setCurrentScanId(scanId);
    setActiveTab("results");
  };

  const handleSelectScan = (scanId: string) => {
    setCurrentScanId(scanId);
    setActiveTab("results");
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: `url(${heroBg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
        
        <div className="relative container mx-auto px-4 py-16">
          <div className="flex items-center justify-between mb-12">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-3xl font-bold">Idescan</h1>
            </div>

            <div>
              {user ? (
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    {user.email}
                  </span>
                  <Button
                    variant="outline"
                    onClick={handleSignOut}
                    className="gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => setShowAuthDialog(true)}
                  className="gap-2 bg-gradient-primary hover:opacity-90"
                >
                  <LogIn className="w-4 h-4" />
                  Sign In
                </Button>
              )}
            </div>
          </div>

          <div className="text-center max-w-3xl mx-auto mb-16 space-y-6">
            <h2 className="text-5xl md:text-6xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Shazam for Innovations
            </h2>
            <p className="text-xl text-muted-foreground">
              Scan your ideas and instantly discover similar innovations across patents, 
              startups, and research papers worldwide.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-12">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
            <TabsTrigger value="scan" className="gap-2">
              <ScanSearch className="w-4 h-4" />
              New Scan
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2" disabled={!user}>
              <History className="w-4 h-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scan" className="space-y-8">
            <ScanForm onScanStart={handleScanStart} />
          </TabsContent>

          <TabsContent value="history">
            {user ? (
              <ScanHistory onSelectScan={handleSelectScan} />
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  Sign in to view your scan history
                </p>
                <Button onClick={() => setShowAuthDialog(true)}>
                  Sign In
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="results">
            {currentScanId ? (
              <ScanResults scanId={currentScanId} />
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  Start a scan to see results
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
    </div>
  );
};

export default Index;
