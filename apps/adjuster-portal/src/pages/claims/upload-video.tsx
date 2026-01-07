import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Video as VideoIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Header } from '@/components/layout/header';
import { useToast } from '@/hooks/use-toast';
import { useClaim } from '@/hooks/use-claims';
import { useUploadVideo } from '@/hooks/use-video-upload';

export function UploadVideoPage() {
  const { id: claimId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: claim, isLoading: isClaimLoading } = useClaim(claimId || '');
  const uploadVideo = useUploadVideo();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('video/')) {
      toast({
        title: 'Invalid File',
        description: 'Please select a valid video file.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 500MB)
    const maxSize = 500 * 1024 * 1024; // 500MB
    if (file.size > maxSize) {
      toast({
        title: 'File Too Large',
        description: 'Video file must be less than 500MB.',
        variant: 'destructive',
      });
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !claimId) return;

    setUploadProgress(0);

    try {
      const result = await uploadVideo.mutateAsync({
        claimId,
        videoFile: selectedFile,
        onProgress: progress => setUploadProgress(progress),
      });

      toast({
        title: 'Upload Successful',
        description: 'Redirecting to video review...',
      });

      // Navigate to video review page
      navigate(`/claims/${claimId}/video-review/${result.id}`);
    } catch (error: any) {
      console.error('Upload failed:', error);
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload video. Please try again.',
        variant: 'destructive',
      });
      setUploadProgress(0);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  if (isClaimLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center font-medium">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Upload Assessment Video"
        description={`Claim: ${claim?.claimNumber || claimId}`}
      >
        <Button variant="outline" size="sm" onClick={() => navigate(`/claims/${claimId}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Claim
        </Button>
      </Header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Upload Video for Deception Analysis</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Upload a pre-recorded assessment video to analyze for deception indicators.</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Maximum file size: 500MB</li>
                  <li>Supported formats: MP4, WebM, MOV, AVI</li>
                  <li>You will be required to watch the entire video during processing</li>
                  <li>Processing cannot be skipped or fast-forwarded</li>
                </ul>
              </div>

              {!selectedFile ? (
                <div
                  className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:border-primary transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <VideoIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-sm font-medium mb-1">Click to select video file</p>
                  <p className="text-xs text-muted-foreground">or drag and drop</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
              ) : (
                <div className="border rounded-lg p-4 bg-muted/50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <VideoIcon className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium text-sm">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    {!uploadVideo.isPending && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={handleRemoveFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {uploadVideo.isPending && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Uploading...</span>
                        <span className="font-medium">{uploadProgress}%</span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  onClick={handleUpload}
                  disabled={!selectedFile || uploadVideo.isPending}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadVideo.isPending ? 'Uploading...' : 'Upload & Start Review'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/claims/${claimId}`)}
                  disabled={uploadVideo.isPending}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
