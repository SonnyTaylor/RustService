/**
 * Camera Test Tab
 *
 * Tests webcam functionality with live preview, screenshot capture,
 * fullscreen mode, mirror toggle, and real-time stream diagnostics.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  Play,
  Square,
  XCircle,
  Maximize,
  Minimize,
  FlipHorizontal,
  Download,
  Monitor,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function CameraTestTab() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [isMirrored, setIsMirrored] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(true);
  const [actualFps, setActualFps] = useState<number>(0);
  const [videoInfo, setVideoInfo] = useState<{
    width?: number;
    height?: number;
    frameRate?: number;
    aspectRatio?: number;
    facingMode?: string;
    deviceId?: string;
    groupId?: string;
    colorSpace?: string;
    resizeMode?: string;
    readyState?: string;
    enabled?: boolean;
    muted?: boolean;
  }>({});
  const [videoElementSize, setVideoElementSize] = useState<{
    width: number,
    height: number,
    readyState: number,
    networkState: number,
    decodedFrames?: number,
    droppedFrames?: number
  }>({width: 0, height: 0, readyState: 0, networkState: 0});

  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  // Get available cameras
  useEffect(() => {
    async function getDevices() {
      try {
        // Request permission first
        const initialStream = await navigator.mediaDevices.getUserMedia({ video: true });
        // Stop the initial stream immediately - we just needed permission
        initialStream.getTracks().forEach(track => track.stop());

        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
        setDevices(videoDevices);
        if (videoDevices.length > 0 && !selectedDevice) {
          setSelectedDevice(videoDevices[0].deviceId);
        }
      } catch (err) {
        setError('Camera permission denied or not available');
      }
    }
    getDevices();
  }, []);

  // Start/stop camera
  const toggleCamera = useCallback(async () => {
    if (isActive && stream) {
      stream.getTracks().forEach(track => track.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setStream(null);
      setIsActive(false);
      return;
    }

    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: selectedDevice ? { exact: selectedDevice } : undefined }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        // Ensure video plays
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(console.error);
        };
      }
      setStream(mediaStream);
      setIsActive(true);
    } catch (err) {
      setError('Failed to access camera');
    }
  }, [isActive, stream, selectedDevice]);

  // Take screenshot
  const takeScreenshot = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (isMirrored) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0);
        setScreenshot(canvas.toDataURL('image/png'));
      }
    }
  };

  // Track video settings
  useEffect(() => {
    if (stream) {
      const track = stream.getVideoTracks()[0];
      if (track) {
        const settings = track.getSettings() as any;
        setVideoInfo({
          width: settings.width,
          height: settings.height,
          frameRate: settings.frameRate,
          aspectRatio: settings.aspectRatio,
          facingMode: settings.facingMode,
          deviceId: settings.deviceId,
          groupId: settings.groupId,
          resizeMode: settings.resizeMode,
          colorSpace: settings.colorSpace ? (typeof settings.colorSpace === 'string' ? settings.colorSpace : JSON.stringify(settings.colorSpace)) : undefined,
          readyState: track.readyState,
          enabled: track.enabled,
          muted: track.muted,
        });

        // Listen for track changes
        const handleTrackChange = () => {
          setVideoInfo(prev => ({
            ...prev,
            readyState: track.readyState,
            enabled: track.enabled,
            muted: track.muted,
          }));
        };

        track.addEventListener('mute', handleTrackChange);
        track.addEventListener('unmute', handleTrackChange);
        track.addEventListener('ended', handleTrackChange);

        return () => {
          track.removeEventListener('mute', handleTrackChange);
          track.removeEventListener('unmute', handleTrackChange);
          track.removeEventListener('ended', handleTrackChange);
        };
      }
    } else {
      setVideoInfo({});
      setActualFps(0);
    }
  }, [stream]);

  // Calculate actual FPS
  useEffect(() => {
    if (!isActive || !videoRef.current) return;

    const video = videoRef.current;
    let lastTime = performance.now();
    let frames = 0;
    let callbackId: number;

    const onFrame = (now: number) => {
      frames++;
      if (now - lastTime >= 1000) {
        setActualFps(Math.round((frames * 1000) / (now - lastTime)));
        frames = 0;
        lastTime = now;

        if (video.videoWidth && video.videoHeight) {
          setVideoElementSize({
            width: video.videoWidth,
            height: video.videoHeight,
            readyState: video.readyState,
            networkState: video.networkState,
            decodedFrames: (video as any).webkitDecodedFrameCount,
            droppedFrames: (video as any).webkitDroppedFrameCount
          });
        }
      }
      if ('requestVideoFrameCallback' in video) {
        callbackId = (video as any).requestVideoFrameCallback(onFrame);
      }
    };

    if ('requestVideoFrameCallback' in video) {
      callbackId = (video as any).requestVideoFrameCallback(onFrame);
    }

    return () => {
      if (callbackId && 'cancelVideoFrameCallback' in video) {
        (video as any).cancelVideoFrameCallback(callbackId);
      }
    };
  }, [isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await videoContainerRef.current?.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Camera className="h-5 w-5 text-blue-500" />
            Camera Preview
          </CardTitle>
          <CardDescription>Test webcam functionality</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Controls */}
          <div className="flex flex-wrap gap-4 items-center">
            <Button
              onClick={toggleCamera}
              variant={isActive ? "destructive" : "default"}
            >
              {isActive ? <Square className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {isActive ? 'Stop' : 'Start'}
            </Button>

            {devices.length > 1 && (
              <select
                className="px-3 py-2 rounded-md border bg-background text-sm"
                value={selectedDevice}
                onChange={(e) => setSelectedDevice(e.target.value)}
                disabled={isActive}
              >
                {devices.map((device, i) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-2">
              <Switch
                checked={isMirrored}
                onCheckedChange={setIsMirrored}
                id="mirror"
              />
              <label htmlFor="mirror" className="text-sm flex items-center gap-1">
                <FlipHorizontal className="h-4 w-4" />
                Mirror
              </label>
            </div>

            {isActive && (
              <>
                <Button variant="outline" onClick={takeScreenshot}>
                  <Download className="h-4 w-4 mr-2" />
                  Screenshot
                </Button>
                <Button variant="outline" onClick={toggleFullscreen}>
                  {isFullscreen ? <Minimize className="h-4 w-4 mr-2" /> : <Maximize className="h-4 w-4 mr-2" />}
                  {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                </Button>
                <div className="flex items-center gap-2 ml-auto">
                  <Switch
                    checked={showDiagnostics}
                    onCheckedChange={setShowDiagnostics}
                    id="diagnostics"
                  />
                  <label htmlFor="diagnostics" className="text-sm flex items-center gap-1">
                    <Monitor className="h-4 w-4" />
                    Diagnostics
                  </label>
                </div>
              </>
            )}
          </div>

          {/* Video Preview */}
          <div
            ref={videoContainerRef}
            className={`relative bg-muted rounded-lg overflow-hidden flex items-center justify-center w-full ${isFullscreen ? 'h-screen' : 'h-[min(56.25vw,42vh)]'}`}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-contain ${!isActive ? 'hidden' : ''} ${isMirrored ? 'scale-x-[-1]' : ''}`}
            />
            {!isActive && (
              <div className="text-muted-foreground text-center">
                <Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Click Start to preview camera</p>
              </div>
            )}

            {/* Diagnostic Overlay */}
            {isActive && showDiagnostics && (
              <div className="absolute top-2 left-2 bg-background/80 text-foreground text-xs p-3 rounded-md border backdrop-blur-sm pointer-events-none shadow-lg z-10 min-w-[200px]">
                <div className="font-bold mb-2 border-b pb-1 flex items-center gap-2">
                  <Monitor className="h-3 w-3" />
                  Stream Diagnostics
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                  <span className="text-muted-foreground">Source Res:</span>
                  <span className="font-medium">{videoInfo.width || '?'} x {videoInfo.height || '?'}</span>

                  <span className="text-muted-foreground">Render Res:</span>
                  <span className="font-medium">{videoElementSize.width || '?'} x {videoElementSize.height || '?'}</span>

                  <span className="text-muted-foreground">Target FPS:</span>
                  <span className="font-medium">{videoInfo.frameRate ? Math.round(videoInfo.frameRate) : 'N/A'}</span>

                  <span className="text-muted-foreground">Actual FPS:</span>
                  <span className={`font-medium ${actualFps < (videoInfo.frameRate || 30) * 0.8 ? 'text-destructive' : 'text-green-500'}`}>
                    {actualFps || '...'}
                  </span>

                  <span className="text-muted-foreground">Aspect Ratio:</span>
                  <span className="font-medium">
                    {videoInfo.aspectRatio
                      ? videoInfo.aspectRatio.toFixed(3)
                      : (videoInfo.width && videoInfo.height ? (videoInfo.width / videoInfo.height).toFixed(3) : 'N/A')}
                  </span>

                  <span className="text-muted-foreground">Facing Mode:</span>
                  <span className="capitalize font-medium">{videoInfo.facingMode || 'N/A'}</span>

                  <span className="text-muted-foreground">Track State:</span>
                  <span className={`font-medium ${videoInfo.readyState === 'live' ? 'text-green-500' : 'text-destructive'}`}>
                    {videoInfo.readyState || 'N/A'}
                  </span>

                  {videoElementSize.decodedFrames !== undefined && (
                    <>
                      <span className="text-muted-foreground">Frames:</span>
                      <span className="font-medium">
                        {videoElementSize.decodedFrames} decoded
                        {videoElementSize.droppedFrames !== undefined && videoElementSize.droppedFrames > 0 ? ` (${videoElementSize.droppedFrames} dropped)` : ''}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Hidden canvas for screenshots */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Screenshot preview */}
          {screenshot && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Screenshot:</p>
              <img
                src={screenshot}
                alt="Screenshot"
                className="rounded-lg max-h-32 object-contain"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
