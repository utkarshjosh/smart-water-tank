// TypeScript types/interfaces for database models

export interface Tenant {
  id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: string;
  firebase_uid: string;
  email: string;
  name?: string;
  tenant_id: string;
  role: 'user' | 'admin' | 'super_admin';
  fcm_token?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Device {
  id: string;
  device_id: string; // Device identifier from firmware
  tenant_id: string;
  name?: string;
  firmware_version?: string;
  last_seen?: Date;
  status: 'online' | 'offline';
  created_at: Date;
  updated_at: Date;
}

export interface Measurement {
  id: string;
  device_id: string;
  timestamp: Date;
  level_cm: number;
  volume_l: number;
  temperature_c?: number;
  battery_v?: number;
  rssi?: number;
  created_at: Date;
}

export interface DailySummary {
  id: string;
  device_id: string;
  date: Date;
  total_usage_l: number;
  min_volume_l?: number;
  max_volume_l?: number;
  avg_volume_l?: number;
  refill_events: number;
  leak_suspected: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Alert {
  id: string;
  device_id: string;
  tenant_id: string;
  type: 'tank_full' | 'tank_low' | 'battery_low' | 'device_offline' | 'leak_detected' | 'sensor_fault';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message?: string;
  payload?: any;
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: Date;
  delivered_to_firebase: boolean;
  created_at: Date;
}

export interface DeviceConfig {
  id: string;
  device_id: string;
  measurement_interval_ms: number;
  report_interval_ms: number;
  tank_full_threshold_l?: number;
  tank_low_threshold_l?: number;
  battery_low_threshold_v?: number;
  level_empty_cm?: number;
  level_full_cm?: number;
  config_json?: any;
  created_at: Date;
  updated_at: Date;
}

export interface FirmwareBinary {
  id: string;
  version: string;
  file_path: string;
  file_size?: number;
  checksum?: string;
  description?: string;
  is_active: boolean;
  rollout_percentage: number;
  created_at: Date;
}

export interface UserDeviceMapping {
  id: string;
  user_id: string;
  device_id: string;
  created_at: Date;
}


