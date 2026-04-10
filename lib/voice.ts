const DEFAULT_VOICE = "alloy";

const SPEAKER_VOICE_MAP: Record<string, string> = {
  moderator: "alloy",
  utilitarian: "nova",
  deontologist: "onyx",
  virtue: "shimmer",
  policy: "echo"
};

export function getVoiceForSpeaker(speakerId?: string): string {
  if (!speakerId) {
    return DEFAULT_VOICE;
  }

  return SPEAKER_VOICE_MAP[speakerId] ?? DEFAULT_VOICE;
}

export { DEFAULT_VOICE };
