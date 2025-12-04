import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import api from '../config/api';

interface Device {
  id: string;
  name: string;
  status: string;
  current_volume: number | null;
  last_measurement: string | null;
}

export default function DeviceListScreen() {
  const navigation = useNavigation();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

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
    }
  };

  const renderDevice = ({ item }: { item: Device }) => (
    <TouchableOpacity
      style={styles.deviceCard}
      onPress={() => navigation.navigate('DeviceDetail', { deviceId: item.id })}
    >
      <View style={styles.deviceHeader}>
        <Text style={styles.deviceName}>{item.name || item.id}</Text>
        <View
          style={[
            styles.statusDot,
            item.status === 'online' ? styles.statusOnline : styles.statusOffline,
          ]}
        />
      </View>
      <Text style={styles.volumeText}>
        {item.current_volume !== null && item.current_volume !== undefined
          ? `${Number(item.current_volume).toFixed(1)}L`
          : 'No data'}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={devices}
        renderItem={renderDevice}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  list: {
    padding: 20,
  },
  deviceCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '600',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusOnline: {
    backgroundColor: '#4CAF50',
  },
  statusOffline: {
    backgroundColor: '#F44336',
  },
  volumeText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
});



