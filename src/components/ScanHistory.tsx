import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface Scan {
  id: string;
  text_input: string;
  status: string;
  created_at: string;
  scan_results: { count: number }[];
}

interface ScanHistoryProps {
  onSelectScan: (scanId: string) => void;
}

export function ScanHistory({ onSelectScan }: ScanHistoryProps) {
  const [scans, setScans] = useState<Scan[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchScans();
  }, []);

  const fetchScans = async () => {
    try {
      const { data, error } = await supabase
        .from('scans')
        .select(`
          id,
          text_input,
          status,
          created_at,
          scan_results (count)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setScans(data || []);
    } catch (error) {
      console.error('Error fetching scan history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-success text-success-foreground';
      case 'processing': return 'bg-warning text-warning-foreground';
      case 'failed': return 'bg-destructive text-destructive-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (scans.length === 0) {
    return (
      <Card className="bg-gradient-card border-border">
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">No scan history yet. Start your first scan!</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Recent Scans</h2>
      <div className="grid gap-4">
        {scans.map((scan) => (
          <Card key={scan.id} className="bg-gradient-card border-border hover:border-primary/50 transition-all">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <CardTitle className="text-base line-clamp-2 flex-1">
                  {scan.text_input}
                </CardTitle>
                <Badge className={getStatusColor(scan.status)} variant="secondary">
                  {scan.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {formatDistanceToNow(new Date(scan.created_at), { addSuffix: true })}
                  </div>
                  <span>
                    {scan.scan_results?.[0]?.count || 0} results
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectScan(scan.id)}
                  className="gap-2"
                >
                  <Eye className="w-4 h-4" />
                  View Results
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
