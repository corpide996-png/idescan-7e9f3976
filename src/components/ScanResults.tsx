import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, MapPin, Building2, Target, AlertTriangle, Lightbulb } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MarketPerformance {
  trend: 'growing' | 'stable' | 'declining';
  growth_rate: number;
  market_size: string;
}

interface Location {
  location: string;
  score: number;
  reason: string;
}

interface Sector {
  sector: string;
  score: number;
  potential: string;
}

interface TimelinePoint {
  month: number;
  revenue: number;
  users: number;
}

interface SimulationData {
  predicted_success: number;
  timeline: TimelinePoint[];
  risks: string[];
  opportunities: string[];
}

interface ScanResult {
  id: string;
  scan_id: string;
  created_at: string;
  tech_score: number | null;
  fashion_score: number | null;
  health_score: number | null;
  agriculture_score: number | null;
  arts_score: number | null;
  market_performance: MarketPerformance | null;
  best_locations: Location[] | null;
  best_sectors: Sector[] | null;
  simulation_data: SimulationData | null;
}

interface ScanResultsProps {
  scanId: string;
}

export function ScanResults({ scanId }: ScanResultsProps) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [scanStatus, setScanStatus] = useState<string>('processing');

  useEffect(() => {
    fetchResults();
    checkScanStatus();
    
    const timeoutId = setTimeout(() => {
      checkScanStatus();
    }, 30000);
    
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
          const typedPayload: ScanResult = {
            ...(payload.new as any),
            market_performance: (payload.new.market_performance as unknown) as MarketPerformance | null,
            best_locations: (payload.new.best_locations as unknown) as Location[] | null,
            best_sectors: (payload.new.best_sectors as unknown) as Sector[] | null,
            simulation_data: (payload.new.simulation_data as unknown) as SimulationData | null,
          };
          setResult(typedPayload);
          setIsLoading(false);
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
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        // Cast the JSON fields to proper types
        const typedResult: ScanResult = {
          ...data,
          market_performance: (data.market_performance as unknown) as MarketPerformance | null,
          best_locations: (data.best_locations as unknown) as Location[] | null,
          best_sectors: (data.best_sectors as unknown) as Sector[] | null,
          simulation_data: (data.simulation_data as unknown) as SimulationData | null,
        };
        setResult(typedResult);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error fetching results:', error);
      setIsLoading(false);
    }
  };

  const getCategoryColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-blue-500";
    if (score >= 40) return "bg-yellow-500";
    return "bg-gray-500";
  };

  const getTrendIcon = (trend: string) => {
    if (trend === 'growing') return <TrendingUp className="w-5 h-5 text-green-500" />;
    if (trend === 'declining') return <TrendingDown className="w-5 h-5 text-red-500" />;
    return <Minus className="w-5 h-5 text-gray-500" />;
  };

  if (isLoading || scanStatus === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-6">
        <div className="relative">
          <div className="w-24 h-24 border-4 border-primary/30 rounded-full"></div>
          <div className="absolute top-0 left-0 w-24 h-24 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-xl font-semibold">Analyzing Your Idea</h3>
          <p className="text-muted-foreground">
            AI is performing market analysis across multiple categories...
          </p>
        </div>
      </div>
    );
  }

  if (scanStatus === 'failed') {
    return (
      <div className="text-center py-12">
        <p className="text-destructive text-lg mb-4">
          Analysis failed. Please try again.
        </p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-lg">
          No analysis available yet.
        </p>
      </div>
    );
  }

  const categories = [
    { name: 'Technology', score: result.tech_score, icon: '💻' },
    { name: 'Fashion', score: result.fashion_score, icon: '👗' },
    { name: 'Health', score: result.health_score, icon: '🏥' },
    { name: 'Agriculture', score: result.agriculture_score, icon: '🌾' },
    { name: 'Arts', score: result.arts_score, icon: '🎨' },
  ];

  return (
    <div className="space-y-8">
      {/* Category Scores */}
      <Card className="bg-gradient-card border-border">
        <CardHeader>
          <CardTitle className="text-2xl">Category Analysis</CardTitle>
          <p className="text-sm text-muted-foreground">
            How your idea scores across different industries
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {categories.map((category) => (
            <div key={category.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{category.icon}</span>
                  <span className="font-medium">{category.name}</span>
                </div>
                <Badge className={getCategoryColor(category.score || 0)}>
                  {category.score}%
                </Badge>
              </div>
              <Progress value={category.score || 0} className="h-2" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Tabs defaultValue="performance" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="locations">Best Locations</TabsTrigger>
          <TabsTrigger value="simulation">AI Simulation</TabsTrigger>
        </TabsList>

        {/* Market Performance */}
        <TabsContent value="performance" className="space-y-4">
          <Card className="bg-gradient-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {result.market_performance && getTrendIcon(result.market_performance.trend)}
                Market Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.market_performance && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Trend</p>
                      <p className="text-xl font-semibold capitalize">{result.market_performance.trend}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Growth Rate</p>
                      <p className="text-xl font-semibold">{result.market_performance.growth_rate}%</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Market Size</p>
                    <p className="text-xl font-semibold capitalize">{result.market_performance.market_size}</p>
                  </div>
                </>
              )}

              {/* Best Sectors */}
              {result.best_sectors && result.best_sectors.length > 0 && (
                <div className="pt-4 border-t space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Best Sectors
                  </h4>
                  {result.best_sectors.map((sector, idx) => (
                    <Card key={idx} className="bg-muted/50">
                      <CardContent className="pt-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{sector.sector}</span>
                          <Badge variant="secondary">{sector.score}%</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{sector.potential}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Best Locations */}
        <TabsContent value="locations" className="space-y-4">
          <Card className="bg-gradient-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Recommended Locations
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Where your idea would perform best
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {result.best_locations && result.best_locations.map((location, idx) => (
                <Card key={idx} className="bg-muted/50">
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-lg">{location.location}</span>
                      <Badge className="bg-primary">{location.score}%</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{location.reason}</p>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Simulation */}
        <TabsContent value="simulation" className="space-y-4">
          <Card className="bg-gradient-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Market Success Prediction
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {result.simulation_data && (
                <>
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-2">Predicted Success Rate</p>
                    <div className="text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                      {result.simulation_data.predicted_success}%
                    </div>
                  </div>

                  {/* Timeline Visualization */}
                  {result.simulation_data.timeline && result.simulation_data.timeline.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-semibold">6-Month Projection</h4>
                      <div className="grid grid-cols-3 gap-2">
                        {result.simulation_data.timeline.slice(0, 6).map((point, idx) => (
                          <Card key={idx} className="bg-muted/50 text-center">
                            <CardContent className="pt-3 pb-3 space-y-1">
                              <p className="text-xs text-muted-foreground">Month {point.month}</p>
                              <p className="text-sm font-semibold">${(point.revenue / 1000).toFixed(1)}K</p>
                              <p className="text-xs text-muted-foreground">{point.users} users</p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Risks */}
                  {result.simulation_data.risks && result.simulation_data.risks.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2 text-orange-500">
                        <AlertTriangle className="w-5 h-5" />
                        Key Risks
                      </h4>
                      <ul className="space-y-2">
                        {result.simulation_data.risks.map((risk, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm">
                            <span className="text-orange-500 mt-1">•</span>
                            <span>{risk}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Opportunities */}
                  {result.simulation_data.opportunities && result.simulation_data.opportunities.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-semibold flex items-center gap-2 text-green-500">
                        <Lightbulb className="w-5 h-5" />
                        Opportunities
                      </h4>
                      <ul className="space-y-2">
                        {result.simulation_data.opportunities.map((opp, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm">
                            <span className="text-green-500 mt-1">•</span>
                            <span>{opp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
