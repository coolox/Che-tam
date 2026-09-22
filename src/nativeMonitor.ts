import { NativeModules, Platform } from 'react-native';

import { CanaryRecord } from './types';

interface NativeCanaryMonitor {
  start(): Promise<boolean>;
  stop(): Promise<boolean>;
  runNow(): Promise<CanaryRecord[]>;
  isActive(): Promise<boolean>;
  drainRecords(): Promise<CanaryRecord[]>;
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  requestIgnoreBatteryOptimizations(): Promise<boolean>;
}
const monitor = NativeModules.CanaryMonitor as NativeCanaryMonitor | undefined;
export function isNativeMonitorAvailable(): boolean { return Platform.OS === 'android' && monitor !== undefined; }
export async function startNativeMonitor(): Promise<void> { if (!monitor) throw new Error('Native monitor is unavailable'); await monitor.start(); }
export async function stopNativeMonitor(): Promise<void> { if (monitor) await monitor.stop(); }
export async function runNativeMonitorNow(): Promise<CanaryRecord[]> { if (!monitor) throw new Error('Native monitor is unavailable'); return monitor.runNow(); }
export async function isNativeMonitorActive(): Promise<boolean> { return monitor ? monitor.isActive() : false; }
export async function drainNativeMonitorRecords(): Promise<CanaryRecord[]> { return monitor ? monitor.drainRecords() : []; }
export async function isIgnoringBatteryOptimizations(): Promise<boolean> { return monitor ? monitor.isIgnoringBatteryOptimizations() : false; }
export async function requestIgnoreBatteryOptimizations(): Promise<void> { if (!monitor) throw new Error('Native monitor is unavailable'); await monitor.requestIgnoreBatteryOptimizations(); }
