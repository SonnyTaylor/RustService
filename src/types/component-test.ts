/**
 * Component Test Types
 * 
 * Types for hardware component testing functionality.
 */

/**
 * Test status states
 */
export type TestStatus = 'idle' | 'running' | 'success' | 'error';

/**
 * Camera test state
 */
export interface CameraTestState {
  isActive: boolean;
  selectedDeviceId: string | null;
  devices: MediaDeviceInfo[];
  isMirrored: boolean;
  error: string | null;
}

/**
 * Audio test state
 */
export interface AudioTestState {
  isMicActive: boolean;
  isSpeakerActive: boolean;
  selectedMicId: string | null;
  selectedSpeakerId: string | null;
  micDevices: MediaDeviceInfo[];
  speakerDevices: MediaDeviceInfo[];
  volume: number;
  error: string | null;
}

/**
 * Keyboard key info
 */
export interface KeyInfo {
  code: string;
  key: string;
  pressed: boolean;
  tested: boolean;
}

/**
 * Mouse test state
 */
export interface MouseTestState {
  position: { x: number; y: number };
  leftClicks: number;
  rightClicks: number;
  middleClicks: number;
  scrollUp: number;
  scrollDown: number;
  lastEvent: string;
}

/**
 * Network test result
 */
export interface NetworkTestResult {
  status: TestStatus;
  isOnline: boolean;
  latencyMs: number | null;
  downloadSpeed: string | null;
  error: string | null;
}

/**
 * Display test patterns
 */
export type DisplayPattern = 
  | 'red' 
  | 'green' 
  | 'blue' 
  | 'white' 
  | 'black' 
  | 'gradient' 
  | 'checkerboard' 
  | 'grid';
