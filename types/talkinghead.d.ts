/**
 * Type declarations for @met4citizen/talkinghead
 * Based on https://github.com/met4citizen/TalkingHead (v1.7)
 */
declare module "@met4citizen/talkinghead" {
  import { Camera, Object3D, Scene } from "three";

  /** Avatar configuration for showAvatar */
  export interface AvatarOptions {
    /** URL for the GLB file */
    url: string;
    /** Body form 'M' or 'F' */
    body?: "M" | "F";
    /** Lip-sync language, e.g. 'fi', 'en' */
    lipsyncLang?: string;
    /** Text-to-speech language, e.g. "fi-FI" */
    ttsLang?: string;
    /** Voice name */
    ttsVoice?: string;
    /** Voice rate */
    ttsRate?: number;
    /** Voice pitch */
    ttsPitch?: number;
    /** Voice volume */
    ttsVolume?: number;
    /** Initial mood */
    avatarMood?: string;
    /** If true, muted */
    avatarMute?: boolean;
    /** Eye contact while idle [0,1] */
    avatarIdleEyeContact?: number;
    /** Head movement while idle [0,1] */
    avatarIdleHeadMove?: number;
    /** Eye contact while speaking [0,1] */
    avatarSpeakingEyeContact?: number;
    /** Head movement while speaking [0,1] */
    avatarSpeakingHeadMove?: number;
    /** Config for Dynamic Bones feature */
    modelDynamicBones?: DynamicBoneConfig[];
    /** Root object name (default: "Armature") */
    modelRoot?: string;
    /** Baseline blend shape adjustments */
    baseline?: Record<string, number>;
  }

  export interface DynamicBoneConfig {
    bone: string;
    type?: "full" | "point";
    stiffness?: number;
    damping?: number;
    pivot?: boolean;
    limits?: (null | number[])[];
    excludes?: { bone: string; deltaLocal?: number[]; radius?: number }[];
  }

  /** Audio object for speakAudio */
  export interface AudioData {
    /** Audio buffer or array of buffers */
    audio: AudioBuffer | ArrayBuffer | ArrayBuffer[];
    /** Words */
    words?: string[];
    /** Starting times of words (ms) */
    wtimes?: number[];
    /** Durations of words (ms) */
    wdurations?: number[];
    /** Oculus lip-sync viseme IDs */
    visemes?: string[];
    /** Starting times of visemes (ms) */
    vtimes?: number[];
    /** Durations of visemes (ms) */
    vdurations?: number[];
    /** Blendshape animation data */
    anim?: {
      name: string;
      dt: number[];
      vs: Record<string, number[]>;
    };
  }

  /** Stream start options */
  export interface StreamOptions {
    sampleRate?: number;
    gain?: number;
    lipsyncLang?: string;
    lipsyncType?: "visemes" | "blendshapes" | "words";
    waitForAudioChunks?: boolean;
    mood?: string;
    metrics?: { enabled: boolean; intervalHz?: number };
  }

  /** Constructor options */
  export interface TalkingHeadOptions {
    /** TTS proxy endpoint */
    ttsEndpoint?: string;
    /** Function to get JWT token */
    jwtGet?: () => Promise<string>;
    /** Lip-sync language modules to load, e.g. ["en", "fi"] */
    lipsyncModules?: string[];
    /** Camera view: 'full', 'upper', 'mid', 'head' */
    cameraView?: string;
    /** Speech mixer gain */
    mixerGainSpeech?: number;
    /** Enable camera rotation */
    cameraRotateEnable?: boolean;
    /** Enable Draco compression */
    dracoEnabled?: boolean;
    /** Avatar-only mode */
    avatarOnly?: boolean;
    /** Camera for avatar-only mode */
    avatarOnlyCamera?: Camera;
    /** Callback for animation update */
    update?: (dt: number) => void;
    /** Model root name (default: "Armature") */
    modelRoot?: string;
    /** Show stats */
    statsEnabled?: boolean;
    /** Background color */
    background?: string | number;
  }

  export class TalkingHead {
    /** Audio context */
    audioCtx: AudioContext;
    /** ThreeJS scene */
    scene: Scene;
    /** ThreeJS camera */
    camera: Camera;
    /** Armature of the loaded avatar */
    armature: Object3D;
    /** Current view name */
    viewName: string;
    /** Pose templates */
    poseTemplates: Record<string, any>;
    /** Animation moods */
    animMoods: Record<string, any>;
    /** Gesture templates */
    gestureTemplates: Record<string, any>;
    /** Animation emojis */
    animEmojis: Record<string, any>;
    /** Morph target avatar data */
    mtAvatar: Record<string, any>;
    /** Target to speak to */
    speakTo: TalkingHead | Object3D | null;

    constructor(element: HTMLElement, options?: TalkingHeadOptions);

    /**
     * Load and show an avatar
     */
    showAvatar(avatar: AvatarOptions, onProgress?: (url: string, event: ProgressEvent) => void): Promise<void>;

    /**
     * Start the animation loop
     */
    start(): void;

    /**
     * Stop the animation loop
     */
    stop(): void;

    /**
     * Animate (for avatar-only mode)
     */
    animate(dt: number): void;

    /**
     * Set the camera view
     */
    setView(viewName: string, options?: Record<string, any>): void;

    /**
     * Speak text using TTS
     */
    speakText(text: string, options?: Record<string, any>, onSubtitles?: (node: HTMLElement) => void): void;

    /**
     * Speak with provided audio data
     */
    speakAudio(audio: AudioData, options?: Record<string, any>, onSubtitles?: (word: string) => void): void;

    /**
     * Add a marker to the speech queue
     */
    speakMarker(callback: () => void): void;

    /**
     * Play a pose
     */
    playPose(poseName: string, duration?: number): void;

    /**
     * Play a gesture
     */
    playGesture(gestureName: string, duration?: number): void;

    /**
     * Set mood
     */
    setMood(moodName: string): void;

    /**
     * Set a fixed blend shape value
     */
    setFixedValue(key: string, value: number | null): void;

    /**
     * Start streaming mode
     */
    streamStart(
      opt?: StreamOptions,
      onAudioStart?: () => void,
      onAudioEnd?: () => void,
      onSubtitles?: (text: string) => void,
      onMetrics?: (data: any) => void
    ): void;

    /**
     * Send a chunk of PCM audio data for streaming
     */
    streamAudio(data: {
      audio?: ArrayBuffer | Uint8Array;
      visemes?: string[];
      vtimes?: number[];
      vdurations?: number[];
      words?: string[];
      wtimes?: number[];
      wdurations?: number[];
      anims?: any[];
    }): void;

    /**
     * Signal end of streaming data
     */
    streamNotifyEnd(): void;

    /**
     * Interrupt streaming playback
     */
    streamInterrupt(): void;

    /**
     * Stop streaming session
     */
    streamStop(): void;
  }
}
