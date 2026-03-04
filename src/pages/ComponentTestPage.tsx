/**
 * Component Test Page
 * 
 * Hardware testing tools for technicians - camera, audio, keyboard, 
 * mouse, network, and display diagnostics.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Camera,
  Mic,
  Volume2,
  Keyboard,
  Mouse,
  Wifi,
  Monitor,
  MoreHorizontal,
  Play,
  Square,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Maximize,
  Minimize,
  FlipHorizontal,
  RefreshCw,
  Download,
  Bluetooth,
  Usb,
  Gamepad2,
  Hand,
  AudioWaveform,
  TrendingUp,
} from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';

import type { MouseTestState, DisplayPattern } from '@/types';
import { GamepadTestTab } from '@/components/component-test/GamepadTestTab';

// ============================================================================
// CAMERA TEST TAB
// ============================================================================

function CameraTestTab() {
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

// ============================================================================
// AUDIO TEST TAB
// ============================================================================

function AudioTestTab() {
  const [isMicActive, setIsMicActive] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSweeping, setIsSweeping] = useState(false);
  const [frequency, setFrequency] = useState([440]);
  const [waveform, setWaveform] = useState<OscillatorType>('sine');
  const [pan, setPan] = useState(0); // -1 = L, 0 = both, 1 = R
  const [volume, setVolume] = useState([10]); // 0–100
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const panNodeRef = useRef<StereoPannerNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const sweepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getOrCreateContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  };

  // Start microphone test
  const toggleMic = async () => {
    if (isMicActive) {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setIsMicActive(false);
      setMicVolume(0);
      return;
    }
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioContext = getOrCreateContext();
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      analyser.fftSize = 256;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setMicVolume(Math.round((avg / 255) * 100));
        animationRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();
      setIsMicActive(true);
    } catch {
      setError('Microphone permission denied or not available');
    }
  };

  const stopTone = () => {
    if (oscillatorRef.current) {
      try { oscillatorRef.current.stop(); } catch { /* already stopped */ }
      oscillatorRef.current = null;
    }
    if (sweepTimerRef.current) {
      clearTimeout(sweepTimerRef.current);
      sweepTimerRef.current = null;
    }
    setIsPlaying(false);
    setIsSweeping(false);
  };

  const startTone = (freqOverride?: number) => {
    const audioContext = getOrCreateContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const panNode = audioContext.createStereoPanner();

    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(freqOverride ?? frequency[0], audioContext.currentTime);
    gainNode.gain.setValueAtTime(volume[0] / 1000, audioContext.currentTime);
    panNode.pan.setValueAtTime(pan, audioContext.currentTime);

    oscillator.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(audioContext.destination);
    oscillator.start();

    oscillatorRef.current = oscillator;
    gainNodeRef.current = gainNode;
    panNodeRef.current = panNode;
    setIsPlaying(true);
  };

  const toggleTone = () => {
    if (isPlaying) { stopTone(); return; }
    startTone();
  };

  // Sweep: 100Hz → 2000Hz over 3s
  const startSweep = () => {
    if (isPlaying) stopTone();
    const audioContext = getOrCreateContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const panNode = audioContext.createStereoPanner();

    oscillator.type = waveform;
    gainNode.gain.setValueAtTime(volume[0] / 1000, audioContext.currentTime);
    panNode.pan.setValueAtTime(pan, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(100, audioContext.currentTime);
    oscillator.frequency.linearRampToValueAtTime(2000, audioContext.currentTime + 3);

    oscillator.connect(gainNode);
    gainNode.connect(panNode);
    panNode.connect(audioContext.destination);
    oscillator.start();

    oscillatorRef.current = oscillator;
    gainNodeRef.current = gainNode;
    panNodeRef.current = panNode;
    setIsPlaying(true);
    setIsSweeping(true);

    sweepTimerRef.current = setTimeout(() => {
      stopTone();
      setFrequency([440]);
    }, 3100);
  };

  // Live-update frequency on slider change
  useEffect(() => {
    if (oscillatorRef.current && audioContextRef.current && !isSweeping) {
      oscillatorRef.current.frequency.setValueAtTime(frequency[0], audioContextRef.current.currentTime);
    }
  }, [frequency, isSweeping]);

  // Live-update waveform
  useEffect(() => {
    if (oscillatorRef.current) oscillatorRef.current.type = waveform;
  }, [waveform]);

  // Live-update volume
  useEffect(() => {
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setValueAtTime(volume[0] / 1000, audioContextRef.current.currentTime);
    }
  }, [volume]);

  // Live-update pan
  useEffect(() => {
    if (panNodeRef.current && audioContextRef.current) {
      panNodeRef.current.pan.setValueAtTime(pan, audioContextRef.current.currentTime);
    }
  }, [pan]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (oscillatorRef.current) { try { oscillatorRef.current.stop(); } catch { /* ok */ } }
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (sweepTimerRef.current) clearTimeout(sweepTimerRef.current);
    };
  }, []);

  const waveforms: { type: OscillatorType; label: string }[] = [
    { type: 'sine', label: 'Sine' },
    { type: 'square', label: 'Square' },
    { type: 'sawtooth', label: 'Saw' },
    { type: 'triangle', label: 'Triangle' },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {error && (
        <Alert variant="destructive" className="md:col-span-2">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Microphone Test */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mic className="h-5 w-5 text-red-500" />
            Microphone Test
          </CardTitle>
          <CardDescription>Test microphone input level</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={toggleMic}
            variant={isMicActive ? "destructive" : "default"}
            className="w-full"
          >
            {isMicActive ? <Square className="h-4 w-4 mr-2" /> : <Mic className="h-4 w-4 mr-2" />}
            {isMicActive ? 'Stop Recording' : 'Start Recording'}
          </Button>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Input Level</span>
              <Badge variant={micVolume > 50 ? 'default' : 'secondary'}>{micVolume}%</Badge>
            </div>
            <Progress value={micVolume} className="h-4" />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Speak into the microphone - the meter should respond
          </p>
        </CardContent>
      </Card>

      {/* Speaker / Tone Generator */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Volume2 className="h-5 w-5 text-green-500" />
            Tone Generator
          </CardTitle>
          <CardDescription>Test speakers with precise tones</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Play / Stop / Sweep */}
          <div className="flex gap-2">
            <Button
              onClick={toggleTone}
              variant={isPlaying && !isSweeping ? "destructive" : "default"}
              className="flex-1"
              disabled={isSweeping}
            >
              {isPlaying && !isSweeping ? <Square className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {isPlaying && !isSweeping ? 'Stop' : 'Play'}
            </Button>
            <Button
              onClick={isSweeping ? stopTone : startSweep}
              variant={isSweeping ? "destructive" : "outline"}
              className="flex-1"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              {isSweeping ? 'Stop Sweep' : 'Sweep'}
            </Button>
          </div>

          {/* Waveform */}
          <div className="space-y-1.5">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <AudioWaveform className="h-3.5 w-3.5" /> Waveform
            </span>
            <div className="flex gap-1.5">
              {waveforms.map(({ type, label }) => (
                <Button
                  key={type}
                  size="sm"
                  variant={waveform === type ? 'default' : 'outline'}
                  className="flex-1 text-xs"
                  onClick={() => setWaveform(type)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Frequency */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Frequency</span>
              <Badge variant="outline">{frequency[0]} Hz</Badge>
            </div>
            <Slider value={frequency} onValueChange={setFrequency} min={100} max={2000} step={50} className="w-full" disabled={isSweeping} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>100 Hz</span>
              <span>2000 Hz</span>
            </div>
            <div className="flex gap-1.5 justify-center">
              {[100, 261, 440, 880, 1000, 2000].map(freq => (
                <Button key={freq} variant="outline" size="sm" className="text-xs px-2" onClick={() => setFrequency([freq])} disabled={isSweeping}>
                  {freq === 261 ? 'C4' : freq === 440 ? 'A4' : freq === 880 ? 'A5' : `${freq}`}
                </Button>
              ))}
            </div>
          </div>

          {/* Volume */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Volume</span>
              <Badge variant="outline">{volume[0]}%</Badge>
            </div>
            <Slider value={volume} onValueChange={setVolume} min={0} max={100} step={5} className="w-full" />
          </div>

          {/* L/R Channel */}
          <div className="space-y-1.5">
            <span className="text-sm text-muted-foreground">Channel</span>
            <div className="flex gap-1.5">
              {([[-1, 'Left'], [0, 'Both'], [1, 'Right']] as [number, string][]).map(([val, label]) => (
                <Button
                  key={label}
                  size="sm"
                  variant={pan === val ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setPan(val)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// KEYBOARD TEST TAB
// ============================================================================

// Keyboard layouts
const KEYBOARD_LAYOUTS = {
  full: {
    name: 'Full (104 keys)',
    rows: [
      ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'PrintScreen', 'ScrollLock', 'Pause'],
      ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace', 'Insert', 'Home', 'PageUp', 'NumLock', 'NumpadDivide', 'NumpadMultiply', 'NumpadSubtract'],
      ['Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash', 'Delete', 'End', 'PageDown', 'Numpad7', 'Numpad8', 'Numpad9', 'NumpadAdd'],
      ['CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Enter', 'Numpad4', 'Numpad5', 'Numpad6'],
      ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ShiftRight', 'ArrowUp', 'Numpad1', 'Numpad2', 'Numpad3', 'NumpadEnter'],
      ['ControlLeft', 'MetaLeft', 'AltLeft', 'Space', 'AltRight', 'MetaRight', 'ContextMenu', 'ControlRight', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Numpad0', 'NumpadDecimal'],
    ],
  },
  tkl: {
    name: 'TKL (87 keys)',
    rows: [
      ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'PrintScreen', 'ScrollLock', 'Pause'],
      ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace', 'Insert', 'Home', 'PageUp'],
      ['Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash', 'Delete', 'End', 'PageDown'],
      ['CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Enter'],
      ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ShiftRight', 'ArrowUp'],
      ['ControlLeft', 'MetaLeft', 'AltLeft', 'Space', 'AltRight', 'MetaRight', 'ContextMenu', 'ControlRight', 'ArrowLeft', 'ArrowDown', 'ArrowRight'],
    ],
  },
  compact: {
    name: 'Compact (60%)',
    rows: [
      ['Escape', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace'],
      ['Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
      ['CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Enter'],
      ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ShiftRight'],
      ['ControlLeft', 'MetaLeft', 'AltLeft', 'Space', 'AltRight', 'MetaRight', 'ContextMenu', 'ControlRight'],
    ],
  },
};

const KEY_LABELS: Record<string, string> = {
  Escape: 'Esc', Backspace: '⌫', Tab: 'Tab', CapsLock: 'Caps', Enter: '↵',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
  AltLeft: 'Alt', AltRight: 'Alt', MetaLeft: '⊞', MetaRight: '⊞',
  Space: ' ', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  ContextMenu: '☰', PrintScreen: 'PrtSc', ScrollLock: 'ScrLk', Pause: 'Pause',
  Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  NumLock: 'Num', NumpadDivide: '/', NumpadMultiply: '*', NumpadSubtract: '-', NumpadAdd: '+',
  NumpadEnter: '↵', NumpadDecimal: '.', Numpad0: '0', Numpad1: '1', Numpad2: '2', Numpad3: '3',
  Numpad4: '4', Numpad5: '5', Numpad6: '6', Numpad7: '7', Numpad8: '8', Numpad9: '9',
};

type KeyboardLayoutId = keyof typeof KEYBOARD_LAYOUTS;

function KeyboardTestTab() {
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [testedKeys, setTestedKeys] = useState<Set<string>>(new Set());
  const [lastKey, setLastKey] = useState<{ code: string; key: string } | null>(null);
  const [layout, setLayout] = useState<KeyboardLayoutId>('tkl');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      setPressedKeys(prev => new Set([...prev, e.code]));
      setTestedKeys(prev => new Set([...prev, e.code]));
      setLastKey({ code: e.code, key: e.key });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      setPressedKeys(prev => {
        const newSet = new Set(prev);
        newSet.delete(e.code);
        return newSet;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const currentLayout = KEYBOARD_LAYOUTS[layout];
  const allKeys = currentLayout.rows.flat();
  const totalKeys = allKeys.length;
  const testedCount = allKeys.filter(k => testedKeys.has(k)).length;
  const percentage = Math.round((testedCount / totalKeys) * 100);

  const reset = () => {
    setTestedKeys(new Set());
    setLastKey(null);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Keyboard className="h-5 w-5 text-purple-500" />
                Keyboard Test
              </CardTitle>
              <CardDescription>Press keys to test - tested keys turn green</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="px-3 py-1.5 rounded-md border bg-background text-sm"
                value={layout}
                onChange={(e) => setLayout(e.target.value as KeyboardLayoutId)}
              >
                {Object.entries(KEYBOARD_LAYOUTS).map(([id, l]) => (
                  <option key={id} value={id}>{l.name}</option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Keys Tested</span>
              <span className="font-medium">{testedCount} / {totalKeys} ({percentage}%)</span>
            </div>
            <Progress value={percentage} className="h-2" />
          </div>

          {/* Last key pressed */}
          {lastKey && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Last key:</span>
              <Badge>{lastKey.key}</Badge>
              <span className="text-xs text-muted-foreground font-mono">({lastKey.code})</span>
            </div>
          )}

          {/* Keyboard Layout */}
          <ScrollArea className="w-full">
            <div className="space-y-1 min-w-[700px] pb-2">
              {currentLayout.rows.map((row, rowIndex) => (
                <div key={rowIndex} className="flex gap-1 justify-center">
                  {row.map((keyCode) => {
                    const isPressed = pressedKeys.has(keyCode);
                    const isTested = testedKeys.has(keyCode);
                    const label = KEY_LABELS[keyCode] || keyCode.replace('Key', '').replace('Digit', '');
                    
                    let width = 'w-9';
                    if (keyCode === 'Space') width = 'w-48';
                    else if (keyCode === 'Backspace' || keyCode === 'Tab' || keyCode === 'CapsLock') width = 'w-14';
                    else if (keyCode === 'Enter' || keyCode.includes('Shift')) width = 'w-16';
                    else if (keyCode.includes('Control') || keyCode.includes('Alt') || keyCode.includes('Meta')) width = 'w-12';

                    return (
                      <div
                        key={keyCode}
                        className={`
                          ${width} h-9 rounded border flex items-center justify-center text-xs font-medium
                          transition-all duration-100 select-none
                          ${isPressed 
                            ? 'bg-primary text-primary-foreground scale-95 shadow-inner' 
                            : isTested 
                              ? 'bg-green-500/20 border-green-500 text-green-600 dark:text-green-400' 
                              : 'bg-muted/50 hover:bg-muted'}
                        `}
                      >
                        {label}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// MOUSE TEST TAB
// ============================================================================

function MouseTestTab() {
  const [state, setState] = useState<MouseTestState>({
    position: { x: 0, y: 0 },
    leftClicks: 0,
    rightClicks: 0,
    middleClicks: 0,
    scrollUp: 0,
    scrollDown: 0,
    lastEvent: 'None',
  });
  const testAreaRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragComplete, setDragComplete] = useState(false);

  const reset = () => {
    setState({
      position: { x: 0, y: 0 },
      leftClicks: 0,
      rightClicks: 0,
      middleClicks: 0,
      scrollUp: 0,
      scrollDown: 0,
      lastEvent: 'None',
    });
    setDragComplete(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mouse className="h-5 w-5 text-orange-500" />
                Mouse / Trackpad Test
              </CardTitle>
              <CardDescription>Test clicks, scrolling, and movement</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[
              { label: 'Left Click', value: state.leftClicks, color: 'text-blue-500' },
              { label: 'Right Click', value: state.rightClicks, color: 'text-red-500' },
              { label: 'Middle Click', value: state.middleClicks, color: 'text-green-500' },
              { label: 'Scroll Up', value: state.scrollUp, color: 'text-purple-500' },
              { label: 'Scroll Down', value: state.scrollDown, color: 'text-orange-500' },
              { label: 'Drag Test', value: dragComplete ? '✓' : '—', color: dragComplete ? 'text-green-500' : 'text-muted-foreground' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center p-2 rounded-md bg-muted/50">
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>

          {/* Test Area */}
          <div
            ref={testAreaRef}
            className={`
              relative h-64 rounded-lg border-2 border-dashed cursor-crosshair
              transition-colors overflow-hidden
              ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-muted-foreground/50'}
            `}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setState(prev => ({
                ...prev,
                position: { 
                  x: Math.round(e.clientX - rect.left), 
                  y: Math.round(e.clientY - rect.top) 
                },
                lastEvent: 'Mouse Move',
              }));
            }}
            onClick={(e) => {
              if (e.button === 0) {
                setState(prev => ({
                  ...prev,
                  leftClicks: prev.leftClicks + 1,
                  lastEvent: 'Left Click',
                }));
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setState(prev => ({
                ...prev,
                rightClicks: prev.rightClicks + 1,
                lastEvent: 'Right Click',
              }));
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                setState(prev => ({
                  ...prev,
                  middleClicks: prev.middleClicks + 1,
                  lastEvent: 'Middle Click',
                }));
              }
            }}
            onWheel={(e) => {
              if (e.deltaY < 0) {
                setState(prev => ({
                  ...prev,
                  scrollUp: prev.scrollUp + 1,
                  lastEvent: 'Scroll Up',
                }));
              } else {
                setState(prev => ({
                  ...prev,
                  scrollDown: prev.scrollDown + 1,
                  lastEvent: 'Scroll Down',
                }));
              }
            }}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => {
              if (isDragging) {
                setIsDragging(false);
                setDragComplete(true);
              }
            }}
            onMouseLeave={() => setIsDragging(false)}
          >
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30 text-lg pointer-events-none">
              Click, scroll, and drag here
            </div>
            
            {/* Position Display */}
            <div className="absolute top-2 left-2 text-xs font-mono bg-background/80 px-2 py-1 rounded">
              X: {state.position.x}, Y: {state.position.y}
            </div>

            {/* Last Event */}
            <div className="absolute top-2 right-2">
              <Badge variant="outline">{state.lastEvent}</Badge>
            </div>

            {/* Double-click Target */}
            <div
              className="absolute bottom-4 right-4 w-16 h-16 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center text-xs text-center"
              onDoubleClick={() => {
                setState(prev => ({ ...prev, lastEvent: 'Double Click!' }));
              }}
            >
              Double<br/>Click
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// NETWORK TEST TAB
// ============================================================================

interface NetworkTestResult {
  isOnline: boolean;
  latencyMs: number | null;
  error: string | null;
}

function NetworkTestTab() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<NetworkTestResult | null>(null);

  // Online status listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Network test using Tauri backend
  const runTest = async () => {
    setTesting(true);
    setResult(null);

    try {
      const testResult = await invoke<NetworkTestResult>('test_network_latency');
      setResult(testResult);
    } catch (err) {
      setResult({
        isOnline: false,
        latencyMs: null,
        error: String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wifi className="h-5 w-5 text-cyan-500" />
            Network Status
          </CardTitle>
          <CardDescription>Check connectivity and measure latency</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <div className={`h-4 w-4 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
              <span className="font-medium">{isOnline ? 'Connected' : 'Disconnected'}</span>
            </div>
            <Badge variant={isOnline ? 'default' : 'destructive'}>
              {isOnline ? 'Online' : 'Offline'}
            </Badge>
          </div>

          {/* Test Button */}
          <Button 
            onClick={runTest} 
            disabled={!isOnline || testing}
            className="w-full"
          >
            {testing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Run Latency Test
              </>
            )}
          </Button>

          {/* Results */}
          {result && (
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              {result.error ? (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Test Failed</AlertTitle>
                  <AlertDescription>{result.error}</AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="text-3xl font-bold">
                    {result.latencyMs} ms
                  </div>
                  <div className="text-sm text-muted-foreground mb-2">Average Latency</div>
                  <Badge variant={result.latencyMs! < 50 ? 'default' : result.latencyMs! < 150 ? 'secondary' : 'destructive'}>
                    {result.latencyMs! < 50 ? 'Excellent' : result.latencyMs! < 150 ? 'Good' : 'Poor'}
                  </Badge>
                </>
              )}
            </div>
          )}

          <Alert>
            <Wifi className="h-4 w-4" />
            <AlertTitle>Note</AlertTitle>
            <AlertDescription className="text-xs">
              Tests connectivity to Google, Cloudflare, and Microsoft servers. Average latency is calculated from successful responses.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// DISPLAY TEST TAB
// ============================================================================

function DisplayTestTab() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activePattern, setActivePattern] = useState<DisplayPattern | null>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);

  const patterns: { id: DisplayPattern; label: string; style: string }[] = [
    { id: 'red', label: 'Red', style: 'bg-red-500' },
    { id: 'green', label: 'Green', style: 'bg-green-500' },
    { id: 'blue', label: 'Blue', style: 'bg-blue-500' },
    { id: 'white', label: 'White', style: 'bg-white' },
    { id: 'black', label: 'Black', style: 'bg-black' },
    { id: 'gradient', label: 'Gradient', style: 'bg-gradient-to-r from-red-500 via-green-500 to-blue-500' },
    { id: 'checkerboard', label: 'Checker', style: '' },
    { id: 'grid', label: 'Grid', style: '' },
    { id: 'smpte', label: 'SMPTE', style: '' },
    { id: 'crosshatch', label: 'Crosshatch', style: '' },
    { id: 'dot-matrix', label: 'Dots', style: '' },
    { id: 'stripes-h', label: 'H-Stripes', style: '' },
    { id: 'stripes-v', label: 'V-Stripes', style: '' },
  ];

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await fullscreenRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const exitFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    setIsFullscreen(false);
    setActivePattern(null);
  };

  // Listen for escape key
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Compute inline style for custom patterns (shared between thumbnail and fullscreen)
  const getPatternStyle = (id: DisplayPattern | null): React.CSSProperties | undefined => {
    switch (id) {
      case 'checkerboard':
        return {
          backgroundImage: 'repeating-linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%), repeating-linear-gradient(45deg, #000 25%, #fff 25%, #fff 75%, #000 75%)',
          backgroundSize: '40px 40px',
          backgroundPosition: '0 0, 20px 20px',
        };
      case 'grid':
        return {
          backgroundColor: '#fff',
          backgroundImage: 'linear-gradient(to right, #ccc 1px, transparent 1px), linear-gradient(to bottom, #ccc 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        };
      case 'smpte':
        return {
          background: 'linear-gradient(to right, #c0c0c0 14.28%, #c0c000 14.28% 28.56%, #00c0c0 28.56% 42.84%, #00c000 42.84% 57.12%, #c000c0 57.12% 71.4%, #c00000 71.4% 85.68%, #0000c0 85.68%)',
        };
      case 'crosshatch':
        return {
          backgroundColor: '#fff',
          backgroundImage: 'linear-gradient(to right, #999 1px, transparent 1px), linear-gradient(to bottom, #999 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        };
      case 'dot-matrix':
        return {
          backgroundColor: '#fff',
          backgroundImage: 'radial-gradient(circle, #333 1.5px, transparent 1.5px)',
          backgroundSize: '16px 16px',
        };
      case 'stripes-h':
        return {
          backgroundImage: 'repeating-linear-gradient(to bottom, #000 0px, #000 10px, #fff 10px, #fff 20px)',
        };
      case 'stripes-v':
        return {
          backgroundImage: 'repeating-linear-gradient(to right, #000 0px, #000 10px, #fff 10px, #fff 20px)',
        };
      default:
        return undefined;
    }
  };

  // Render pattern
  const renderPattern = () => {
    const style = getPatternStyle(activePattern);
    if (style) return <div className="w-full h-full" style={style} />;
    const pattern = patterns.find(p => p.id === activePattern);
    return <div className={`w-full h-full ${pattern?.style || 'bg-muted'}`} />;
  };

  return (
    <div className="space-y-4">
      {/* Fullscreen Test Element */}
      <div 
        ref={fullscreenRef}
        className={`${isFullscreen ? 'fixed inset-0 z-50' : 'hidden'}`}
        onClick={exitFullscreen}
      >
        {renderPattern()}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white bg-black/50 px-4 py-2 rounded-full text-sm">
          Click anywhere or press ESC to exit
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Monitor className="h-5 w-5 text-indigo-500" />
            Display Test
          </CardTitle>
          <CardDescription>Test for dead pixels and color accuracy</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Monitor className="h-4 w-4" />
            <AlertTitle>Dead Pixel Test</AlertTitle>
            <AlertDescription className="text-xs">
              Click a color pattern, then enter fullscreen mode. Look for pixels that don't match the expected color.
            </AlertDescription>
          </Alert>

          {/* Pattern Selection */}
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            {patterns.map(({ id, label, style }) => (
              <button
                key={id}
                onClick={() => setActivePattern(id)}
                className={`
                  p-2 rounded-lg border-2 transition-all text-center
                  ${activePattern === id ? 'border-primary ring-2 ring-primary/20' : 'border-muted hover:border-muted-foreground/50'}
                `}
              >
                <div
                  className={`w-full aspect-square rounded mb-1 ${style || 'bg-muted'}`}
                  style={getPatternStyle(id)}
                />
                <span className="text-xs">{label}</span>
              </button>
            ))}
          </div>

          {/* Preview & Fullscreen */}
          <div className="flex gap-4 items-center">
            <div
              className={`w-32 h-20 rounded-lg border overflow-hidden ${patterns.find(p => p.id === activePattern)?.style || 'bg-muted'}`}
              style={getPatternStyle(activePattern)}
            />
            <Button 
              onClick={toggleFullscreen}
              disabled={!activePattern}
              className="flex-1"
            >
              {isFullscreen ? (
                <>
                  <Minimize className="h-4 w-4 mr-2" />
                  Exit Fullscreen
                </>
              ) : (
                <>
                  <Maximize className="h-4 w-4 mr-2" />
                  Enter Fullscreen
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// MORE TESTS TAB
// ============================================================================

function MoreTestsTab() {
  const [bluetoothSupported, setBluetoothSupported] = useState<boolean | null>(null);

  useEffect(() => {
    // Bluetooth API
    setBluetoothSupported('bluetooth' in navigator);
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Bluetooth */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bluetooth className="h-5 w-5 text-blue-500" />
            Bluetooth
          </CardTitle>
          <CardDescription>Bluetooth availability</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <span className="text-muted-foreground">Web Bluetooth API</span>
            <Badge variant={bluetoothSupported ? 'default' : 'secondary'}>
              {bluetoothSupported ? 'Supported' : 'Not Supported'}
            </Badge>
          </div>
          {bluetoothSupported && (
            <Button 
              variant="outline" 
              className="w-full"
              onClick={async () => {
                try {
                  await (navigator as any).bluetooth.requestDevice({
                    acceptAllDevices: true
                  });
                } catch (err) {
                  // User cancelled or error
                }
              }}
            >
              <Bluetooth className="h-4 w-4 mr-2" />
              Scan for Devices
            </Button>
          )}
        </CardContent>
      </Card>

      {/* USB */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Usb className="h-5 w-5 text-gray-500" />
            USB Devices
          </CardTitle>
          <CardDescription>Connected USB devices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <span className="text-muted-foreground">WebUSB API</span>
            <Badge variant={'usb' in navigator ? 'default' : 'secondary'}>
              {'usb' in navigator ? 'Supported' : 'Not Supported'}
            </Badge>
          </div>
          {'usb' in navigator && (
            <Button 
              variant="outline" 
              className="w-full mt-4"
              onClick={async () => {
                try {
                  await (navigator as any).usb.requestDevice({ filters: [] });
                } catch (err) {
                  // User cancelled
                }
              }}
            >
              <Usb className="h-4 w-4 mr-2" />
              Request USB Device
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// TOUCH / STYLUS TEST TAB
// ============================================================================

const POINTER_COLORS = ['#ef4444','#3b82f6','#22c55e','#f59e0b','#a855f7','#ec4899','#14b8a6','#f97316'];

function TouchTestTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activePointers, setActivePointers] = useState<Map<number, { x: number; y: number; type: string; pressure: number }>>(new Map());
  const [maxPoints, setMaxPoints] = useState(0);
  const [lastType, setLastType] = useState<string>('—');
  const [lastPressure, setLastPressure] = useState(0);
  const activePointersRef = useRef<Map<number, { x: number; y: number; type: string; pressure: number }>>(new Map());

  const getColor = (id: number) => POINTER_COLORS[id % POINTER_COLORS.length];

  const getCanvasPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    const pos = getCanvasPos(e);
    const updated = new Map(activePointersRef.current);
    updated.set(e.pointerId, { ...pos, type: e.pointerType, pressure: e.pressure });
    activePointersRef.current = updated;
    setActivePointers(new Map(updated));
    setMaxPoints(prev => Math.max(prev, updated.size));
    setLastType(e.pointerType);
    setLastPressure(e.pressure);

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = getColor(e.pointerId);
    ctx.fill();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const prev = activePointersRef.current.get(e.pointerId)!;
    const pos = getCanvasPos(e);
    const lineWidth = e.pointerType === 'pen' ? Math.max(1, e.pressure * 12) : 2;

    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = getColor(e.pointerId);
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    const updated = new Map(activePointersRef.current);
    updated.set(e.pointerId, { ...pos, type: e.pointerType, pressure: e.pressure });
    activePointersRef.current = updated;
    setLastPressure(e.pressure);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const updated = new Map(activePointersRef.current);
    updated.delete(e.pointerId);
    activePointersRef.current = updated;
    setActivePointers(new Map(updated));
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setMaxPoints(0);
    setLastType('—');
    setLastPressure(0);
  };

  // Resize canvas to match container
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const { width, height } = container.getBoundingClientRect();
      // Preserve drawing on resize by saving/restoring image
      const img = canvas.toDataURL();
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx && img) {
        const image = new Image();
        image.onload = () => ctx.drawImage(image, 0, 0);
        image.src = img;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        {/* Active points */}
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <div className="text-3xl font-bold">{activePointers.size}</div>
            <div className="text-xs text-muted-foreground mt-1">Active Points</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <div className="text-3xl font-bold">{maxPoints}</div>
            <div className="text-xs text-muted-foreground mt-1">Max Simultaneous</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <div className="text-3xl font-bold capitalize">{lastType}</div>
            <div className="text-xs text-muted-foreground mt-1">Pointer Type</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <div className="text-3xl font-bold">{lastPressure.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground mt-1">Pressure</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Hand className="h-5 w-5 text-purple-500" />
              Touch / Stylus Draw Area
            </CardTitle>
            <CardDescription>Draw with your finger, stylus, or mouse</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={clearCanvas}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </CardHeader>
        <CardContent>
          <div
            ref={containerRef}
            className="w-full rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 overflow-hidden touch-none"
            style={{ height: 320 }}
          >
            <canvas
              ref={canvasRef}
              className="w-full h-full cursor-crosshair"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{ touchAction: 'none' }}
            />
          </div>
          {activePointers.size > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Array.from(activePointers.entries()).map(([id, info]) => (
                <Badge key={id} variant="outline" style={{ borderColor: getColor(id), color: getColor(id) }}>
                  #{id} ({Math.round(info.x)}, {Math.round(info.y)})
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT TEST PAGE
// ============================================================================

const TEST_TABS = [
  { id: 'camera', label: 'Camera', icon: Camera, component: CameraTestTab },
  { id: 'audio', label: 'Audio', icon: Volume2, component: AudioTestTab },
  { id: 'keyboard', label: 'Keyboard', icon: Keyboard, component: KeyboardTestTab },
  { id: 'mouse', label: 'Mouse', icon: Mouse, component: MouseTestTab },
  { id: 'gamepad', label: 'Gamepad', icon: Gamepad2, component: GamepadTestTab },
  { id: 'touch', label: 'Touch', icon: Hand, component: TouchTestTab },
  { id: 'network', label: 'Network', icon: Wifi, component: NetworkTestTab },
  { id: 'display', label: 'Display', icon: Monitor, component: DisplayTestTab },
  { id: 'more', label: 'More', icon: MoreHorizontal, component: MoreTestsTab },
] as const;

export function ComponentTestPage() {
  return (
  <div className="h-full flex flex-col overflow-hidden min-h-0">
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6 space-y-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6" />
              Component Testing
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Test hardware components - camera, audio, keyboard, mouse, gamepad, network, and display
            </p>
          </div>

          <Tabs defaultValue="camera" className="w-full">
            <TabsList className="grid w-full grid-cols-8 h-auto">
              {TEST_TABS.map(({ id, label, icon: Icon }) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="flex flex-col items-center gap-1 py-2 text-xs"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {TEST_TABS.map(({ id, component: Component }) => (
              <TabsContent key={id} value={id} className="mt-4">
                <Component />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
