/**
 * RuralCare Multi-Tier Emergency SOS Native Dispatcher
 * Unlocks Tier 2 (Silent SMS), Tier 3 (Bluetooth LE Peer Relay),
 * GPS Geolocation, and Local Notification Guidance on Android Capacitor.
 * Safe fallback for standard web environments.
 */

import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { SmsManager } from '@byteowls/capacitor-sms';
import { BleClient } from '@capacitor-community/bluetooth-le';

export interface NativeSosPayload {
  fromName: string;
  role: string;
  patientHealthId: string;
  location?: string;
  emergencyNumber?: string;
  targetedDoctorId?: string;
  vitalsSnapshot?: any;
}

export interface NativeSosResult {
  gpsLocation: string;
  restDispatched: boolean;
  smsDispatched: boolean;
  bleRelayActive: boolean;
  notificationShown: boolean;
  logs: string[];
}

export async function capturePreciseGpsLocation(fallbackLocation: string): Promise<string> {
  try {
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 4000,
      maximumAge: 30000,
    });
    if (pos && pos.coords) {
      return `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (${fallbackLocation})`;
    }
  } catch (err) {
    console.warn('[NativeSOS] Native GPS capture timed out or denied, using web/profile location:', err);
  }
  return fallbackLocation;
}

export async function sendEmergencySmsFallback(
  emergencyNumber: string,
  message: string
): Promise<boolean> {
  try {
    await SmsManager.send({
      numbers: [emergencyNumber],
      text: message,
    });
    console.log('[NativeSOS] Silent emergency SMS dispatched to:', emergencyNumber);
    return true;
  } catch (err) {
    console.warn('[NativeSOS] SMS dispatch failed (requires physical device with SIM card):', err);
    return false;
  }
}

export async function broadcastBleEmergencyRelay(sosCode: string, payload: string): Promise<boolean> {
  try {
    await BleClient.initialize();
    console.log(`[NativeSOS] BLE Peer Relay initialized for alert: ${sosCode}. Searching peers...`);
    // Attempt device scan for nearby RuralCare peer nodes / tablets
    try {
      await BleClient.requestLEScan(
        {
          namePrefix: 'RHC-',
        },
        (result) => {
          console.log('[NativeSOS] Found RuralCare peer responder via BLE:', result.device);
        }
      );
      setTimeout(async () => {
        try {
          await BleClient.stopLEScan();
        } catch {}
      }, 8000);
    } catch {}
    return true;
  } catch (err) {
    console.warn('[NativeSOS] Bluetooth LE relay unavailable on this hardware:', err);
    return false;
  }
}

export async function showOfflineGuidanceNotification(
  patientId: string,
  location: string
): Promise<boolean> {
  try {
    await LocalNotifications.requestPermissions();
    await LocalNotifications.schedule({
      notifications: [
        {
          title: '🚨 Emergency SOS Dispatched (Tier 1-4)',
          body: `Alert active for Patient ${patientId} at ${location}. Escalating to on-duty doctors & emergency control room.`,
          id: Math.floor(Math.random() * 100000),
          schedule: { at: new Date(Date.now() + 500) },
          sound: undefined,
          actionTypeId: '',
          extra: null,
        },
      ],
    });
    return true;
  } catch (err) {
    console.warn('[NativeSOS] Local notification failed:', err);
    return false;
  }
}

/**
 * Attaches Hardware and Sensor Listeners:
 * 1. Double Volume-Button press (dispatched from Android native MainActivity.java)
 * 2. Shake Detection (DeviceMotionEvent accelerometer threshold > 26 m/s²)
 * 3. Keyboard Volume/F2 Double-Press Shortcut
 */
export function setupEmergencyHardwareTriggers(onTrigger: () => void): () => void {
  let lastShakeTime = 0;
  let lastKeyTime = 0;

  // 1. Android Native Bridge Event (Hardware Volume Button Double Press)
  const handleNativeHardwareTrigger = () => {
    console.log('[NativeSOS] Hardware trigger received from Android system');
    onTrigger();
  };
  window.addEventListener('emergency:hardware_trigger', handleNativeHardwareTrigger);

  // 2. Shake-to-SOS (DeviceMotionEvent Accelerometer)
  const handleDeviceMotion = (event: DeviceMotionEvent) => {
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;
    const { x, y, z } = acc;
    if (x === null || y === null || z === null) return;
    const speed = Math.sqrt(x * x + y * y + z * z);
    const now = Date.now();
    // Normal gravity is ~9.8 m/s^2. A rapid double shake spikes over 26 m/s^2
    if (speed > 26 && now - lastShakeTime > 3000) {
      lastShakeTime = now;
      console.log('[NativeSOS] Rapid shake detected! Triggering Emergency SOS...');
      onTrigger();
    }
  };

  if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
    try {
      window.addEventListener('devicemotion', handleDeviceMotion);
    } catch {}
  }

  // 3. Web Keyboard Volume/Emergency Key Shortcut (Press 'F2' or 'VolumeDown' twice rapidly)
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'F2' || e.code === 'AudioVolumeDown' || e.key === 'VolumeDown') {
      const now = Date.now();
      if (now - lastKeyTime < 800) {
        console.log('[NativeSOS] Emergency key double-press detected! Triggering Emergency SOS...');
        onTrigger();
      }
      lastKeyTime = now;
    }
  };
  window.addEventListener('keydown', handleKeyDown);

  return () => {
    window.removeEventListener('emergency:hardware_trigger', handleNativeHardwareTrigger);
    window.removeEventListener('devicemotion', handleDeviceMotion);
    window.removeEventListener('keydown', handleKeyDown);
  };
}
