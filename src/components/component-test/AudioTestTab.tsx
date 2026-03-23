/**
 * Audio Test Tab
 *
 * Tests microphone input levels and speaker output with a tone generator.
 * Supports waveform selection, frequency/volume sliders, L/R channel panning,
 * and a frequency sweep mode.
 */

import { useState, useEffect, useRef } from 'react';
import {
  Mic,
  Volume2,
  Play,
  Square,
  XCircle,
  AudioWaveform,
  TrendingUp,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function AudioTestTab() {
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

  // Sweep: 100Hz -> 2000Hz over 3s
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
