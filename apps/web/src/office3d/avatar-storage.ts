import type { AvatarCustomization, AtmosphereCycle, AudioPreference } from './types';

export const AVATAR_CUSTOMIZATION_KEY = 'synectra:avatar-customization';
export const ATMOSPHERE_CYCLE_KEY = 'synectra:office-atmosphere';
export const AUDIO_PREFERENCE_KEY = 'synectra:office-audio';

export const DEFAULT_AVATAR: AvatarCustomization = {
  hairStyle: 'short',
  hairColor: '#2C221E',
  outfitStyle: 'smart-casual',
  outfitColor: '#2563EB',
  accessory: 'none',
  accentColor: '#388DA7',
};

export const DEFAULT_AUDIO: AudioPreference = {
  enabled: false,
  volume: 0.3,
};

export function getStoredAvatar(storage?: { getItem(key: string): string | null }): AvatarCustomization {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return DEFAULT_AVATAR;
    const raw = store.getItem(AVATAR_CUSTOMIZATION_KEY);
    if (!raw) return DEFAULT_AVATAR;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_AVATAR;
    return {
      hairStyle: ['short', 'long', 'wavy', 'ponytail', 'bald'].includes(parsed.hairStyle) ? parsed.hairStyle : DEFAULT_AVATAR.hairStyle,
      hairColor: typeof parsed.hairColor === 'string' ? parsed.hairColor : DEFAULT_AVATAR.hairColor,
      outfitStyle: ['formal', 'casual', 'tech', 'smart-casual'].includes(parsed.outfitStyle) ? parsed.outfitStyle : DEFAULT_AVATAR.outfitStyle,
      outfitColor: typeof parsed.outfitColor === 'string' ? parsed.outfitColor : DEFAULT_AVATAR.outfitColor,
      accessory: ['none', 'glasses', 'badge', 'headphones', 'coffee-cup'].includes(parsed.accessory) ? parsed.accessory : DEFAULT_AVATAR.accessory,
      accentColor: typeof parsed.accentColor === 'string' ? parsed.accentColor : DEFAULT_AVATAR.accentColor,
    };
  } catch {
    return DEFAULT_AVATAR;
  }
}

export function setStoredAvatar(
  customization: AvatarCustomization,
  storage?: { setItem(key: string, value: string): void }
): void {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return;
    store.setItem(AVATAR_CUSTOMIZATION_KEY, JSON.stringify(customization));
  } catch {
    // Ignore storage quota/permission failures
  }
}

export function getStoredAtmosphere(storage?: { getItem(key: string): string | null }): AtmosphereCycle {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return 'day';
    const raw = store.getItem(ATMOSPHERE_CYCLE_KEY);
    if (raw === 'sunset' || raw === 'night') return raw;
    return 'day';
  } catch {
    return 'day';
  }
}

export function setStoredAtmosphere(
  cycle: AtmosphereCycle,
  storage?: { setItem(key: string, value: string): void }
): void {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return;
    store.setItem(ATMOSPHERE_CYCLE_KEY, cycle);
  } catch {
    // Ignore storage quota/permission failures
  }
}

export function getStoredAudio(storage?: { getItem(key: string): string | null }): AudioPreference {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return DEFAULT_AUDIO;
    const raw = store.getItem(AUDIO_PREFERENCE_KEY);
    if (!raw) return DEFAULT_AUDIO;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_AUDIO;
    return {
      enabled: Boolean(parsed.enabled),
      volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : DEFAULT_AUDIO.volume,
    };
  } catch {
    return DEFAULT_AUDIO;
  }
}

export function setStoredAudio(
  pref: AudioPreference,
  storage?: { setItem(key: string, value: string): void }
): void {
  try {
    const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!store) return;
    store.setItem(AUDIO_PREFERENCE_KEY, JSON.stringify(pref));
  } catch {
    // Ignore storage quota/permission failures
  }
}

export const getStoredAudioPreference = getStoredAudio;
export const setStoredAudioPreference = setStoredAudio;
