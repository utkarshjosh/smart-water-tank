import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import api from '../config/api';

interface Alert {
  id: string;
  type: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  created_at: string;
}

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      // Get user's devices first
      const devicesRes = await api.get('/api/v1/user/devices');
      const devices = devicesRes.data.devices || [];

      // Fetch alerts for all devices
      const allAlerts: Alert[] = [];
      for (const device of devices) {
        try {
          const alertsRes = await api.get(`/api/v1/user/devices/${device.id}/alerts?limit=10`);
          allAlerts.push(...(alertsRes.data.alerts || []));
        } catch (error) {
          console.error(`Failed to fetch alerts for device ${device.id}:`, error);
        }
      }

      // Sort by date, most recent first
      allAlerts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAlerts(allAlerts);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '#F44336';
      case 'high':
        return '#FF9800';
      case 'medium':
        return '#FFC107';
      default:
        return '#9E9E9E';
    }
  };

  const renderAlert = ({ item }: { item: Alert }) => (
    <View style={styles.alertCard}>
      <View style={styles.alertHeader}>
        <View
          style={[styles.severityDot, { backgroundColor: getSeverityColor(item.severity) }]}
        />
        <Text style={styles.alertType}>{item.type.replace('_', ' ').toUpperCase()}</Text>
        {item.acknowledged && (
          <Text style={styles.acknowledgedBadge}>ACK</Text>
        )}
      </View>
      <Text style={styles.alertMessage}>{item.message}</Text>
      <Text style={styles.alertTime}>
        {new Date(item.created_at).toLocaleString()}
      </Text>
    </View>
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
        data={alerts}
        renderItem={renderAlert}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No alerts</Text>
          </View>
        }
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
  alertCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  severityDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  alertType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    flex: 1,
  },
  acknowledgedBadge: {
    fontSize: 10,
    color: '#4CAF50',
    fontWeight: '600',
  },
  alertMessage: {
    fontSize: 16,
    color: '#333',
    marginBottom: 5,
  },
  alertTime: {
    fontSize: 12,
    color: '#999',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});



