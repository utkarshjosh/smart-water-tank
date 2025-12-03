import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../config/api';

interface Device {
  id: string;
  name: string;
  status: string;
  current_volume: number;
  last_measurement: string;
}

export default function HomeScreen() {
  const navigation = useNavigation();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      const response = await api.get('/api/v1/user/devices');
      setDevices(response.data.devices || []);
    } catch (error) {
      console.error('Failed to fetch devices:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDevices();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const primaryDevice = devices[0];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>My Tank</Text>
      </View>

      {primaryDevice ? (
        <View style={styles.card}>
          <Text style={styles.deviceName}>{primaryDevice.name || primaryDevice.id}</Text>
          <View style={styles.volumeContainer}>
            <Text style={styles.volumeValue}>
              {primaryDevice.current_volume !== null
                ? `${primaryDevice.current_volume.toFixed(1)}L`
                : 'N/A'}
            </Text>
            <Text style={styles.volumeLabel}>Current Volume</Text>
          </View>
          <View style={styles.statusContainer}>
            <View
              style={[
                styles.statusDot,
                primaryDevice.status === 'online' ? styles.statusOnline : styles.statusOffline,
              ]}
            />
            <Text style={styles.statusText}>
              {primaryDevice.status === 'online' ? 'Online' : 'Offline'}
            </Text>
          </View>
          {primaryDevice.last_measurement && (
            <Text style={styles.lastUpdate}>
              Last updated: {new Date(primaryDevice.last_measurement).toLocaleString()}
            </Text>
          )}
          <TouchableOpacity
            style={styles.viewDetailsButton}
            onPress={() => navigation.navigate('DeviceDetail', { deviceId: primaryDevice.id })}
          >
            <Text style={styles.viewDetailsText}>View Details</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.noDevicesText}>No devices found</Text>
          <Text style={styles.noDevicesSubtext}>
            Contact your administrator to link a device
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  deviceName: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
  },
  volumeContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  volumeValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  volumeLabel: {
    fontSize: 16,
    color: '#666',
    marginTop: 5,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusOnline: {
    backgroundColor: '#4CAF50',
  },
  statusOffline: {
    backgroundColor: '#F44336',
  },
  statusText: {
    fontSize: 16,
    color: '#333',
  },
  lastUpdate: {
    fontSize: 12,
    color: '#999',
    marginTop: 10,
  },
  viewDetailsButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    marginTop: 20,
    alignItems: 'center',
  },
  viewDetailsText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  noDevicesText: {
    fontSize: 18,
    textAlign: 'center',
    color: '#666',
  },
  noDevicesSubtext: {
    fontSize: 14,
    textAlign: 'center',
    color: '#999',
    marginTop: 10,
  },
});


