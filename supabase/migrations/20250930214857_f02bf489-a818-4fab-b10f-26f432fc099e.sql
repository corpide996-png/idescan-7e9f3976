-- Create storage bucket for scan images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'scan-images',
  'scan-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for uploads
CREATE POLICY "Anyone can upload scan images"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'scan-images');

-- Create storage policy for viewing
CREATE POLICY "Anyone can view scan images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'scan-images');