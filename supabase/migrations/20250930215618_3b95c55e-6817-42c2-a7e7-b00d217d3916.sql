-- Update storage policies to fix upload issues
DROP POLICY IF EXISTS "Anyone can upload scan images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view scan images" ON storage.objects;

-- Create better storage policies
CREATE POLICY "Authenticated users can upload scan images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'scan-images');

CREATE POLICY "Anyone can upload scan images (anonymous)"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'scan-images');

CREATE POLICY "Anyone can view scan images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'scan-images');

CREATE POLICY "Anyone can update scan images"
ON storage.objects
FOR UPDATE
TO public
USING (bucket_id = 'scan-images');