import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Scan } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ScanFormProps {
  onScanStart: (scanId: string) => void;
}

export function ScanForm({ onScanStart }: ScanFormProps) {
  const [textInput, setTextInput] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const { toast } = useToast();

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please upload an image smaller than 10MB",
          variant: "destructive"
        });
        return;
      }
      setImageFile(file);
    }
  };

  const handleScan = async () => {
    if (!textInput.trim()) {
      toast({
        title: "Text required",
        description: "Please enter a description of your innovation",
        variant: "destructive"
      });
      return;
    }

    setIsScanning(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      let imageUrl = null;
      
      // Handle image upload if present
      if (imageFile) {
        const fileName = `${Date.now()}-${imageFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('scan-images')
          .upload(fileName, imageFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          toast({
            title: "Image upload failed",
            description: "Continuing scan without image",
            variant: "destructive"
          });
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('scan-images')
            .getPublicUrl(uploadData.path);
          
          imageUrl = publicUrl;
        }
      }

      // Create scan record
      const { data: scanData, error: scanError } = await supabase
        .from('scans')
        .insert({
          user_id: user?.id || null,
          text_input: textInput,
          image_url: imageUrl,
          status: 'processing'
        })
        .select()
        .single();

      if (scanError) throw scanError;

      // Start scan immediately and don't wait
      onScanStart(scanData.id);
      
      // Call edge function asynchronously
      supabase.functions.invoke('process-scan', {
        body: { scanId: scanData.id }
      }).catch(error => {
        console.error('Function invoke error:', error);
      });

      setTextInput("");
      setImageFile(null);
      
      toast({
        title: "Scan started!",
        description: "Searching innovation databases..."
      });
      
    } catch (error: any) {
      console.error('Scan error:', error);
      toast({
        title: "Scan failed",
        description: error.message || "Failed to start scan",
        variant: "destructive"
      });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 p-8 rounded-2xl bg-gradient-card border border-border shadow-elegant">
      <div className="space-y-2">
        <Label htmlFor="text-input" className="text-lg font-semibold">
          Describe Your Innovation
        </Label>
        <Textarea
          id="text-input"
          placeholder="Enter a detailed description of your innovation, idea, or product..."
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          className="min-h-[150px] resize-none text-base"
          disabled={isScanning}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="image-upload" className="text-lg font-semibold">
          Upload Sketch or Image (Optional)
        </Label>
        <div className="flex items-center gap-4">
          <Input
            id="image-upload"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="flex-1"
            disabled={isScanning}
          />
          {imageFile && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Upload className="w-4 h-4" />
              <span>{imageFile.name}</span>
            </div>
          )}
        </div>
      </div>

      <Button
        onClick={handleScan}
        disabled={isScanning || !textInput.trim()}
        className="w-full h-14 text-lg font-semibold bg-gradient-primary hover:opacity-90 transition-opacity"
      >
        {isScanning ? (
          <>
            <Scan className="w-5 h-5 mr-2 animate-spin" />
            Scanning...
          </>
        ) : (
          <>
            <Scan className="w-5 h-5 mr-2" />
            Scan for Similar Innovations
          </>
        )}
      </Button>
    </div>
  );
}
