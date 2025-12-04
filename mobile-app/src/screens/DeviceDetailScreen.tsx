import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import api from '../config/api';

const screenWidth = Dimensions.get('window').width;

export default function DeviceDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { deviceId } = route.params as { deviceId: string };
  const [current, setCurrent] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentError, setCurrentError] = useState(false);
  const [historyError, setHistoryError] = useState(false);

  useEffect(() => {
    fetchData();
  }, [deviceId]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setCurrentError(false);
    setHistoryError(false);

    try {
      const promises = [
        api.get(`/api/v1/user/devices/${deviceId}/current`).catch((err) => {
          if (err.response?.status === 404) {
            setCurrentError(true);
            return null;
          }
          throw err;
        }),
        api.get(`/api/v1/user/devices/${deviceId}/history?days=7&limit=100`).catch((err) => {
          if (err.response?.status === 404) {
            setHistoryError(true);
            return { data: { measurements: [] } };
          }
          throw err;
        }),
      ];

      const [currentRes, historyRes] = await Promise.all(promises);

      if (currentRes && currentRes.data) {
        setCurrent(currentRes.data);
      }

      if (historyRes && historyRes.data) {
        setHistory(historyRes.data.measurements || []);
      }
    } catch (error: any) {
      console.error('Failed to fetch device data:', error);
      setError(error.response?.data?.error || 'Failed to load device data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.centerContent}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  const chartData = {
    labels: history
      .slice(-10)
      .map((m) => new Date(m.timestamp).toLocaleDateString()),
    datasets: [
      {
        data: history.slice(-10).map((m) => parseFloat(m.volume_l.toString())),
      },
    ],
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.card}>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {currentError && !current && (
        <View style={styles.card}>
          <Text style={styles.title}>Current Status</Text>
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No current measurements found</Text>
            <Text style={styles.emptyStateSubtext}>
              The device may not have sent any measurements yet.
            </Text>
          </View>
        </View>
      )}

      {current && !currentError && (
        <View style={styles.card}>
          <Text style={styles.title}>Current Status</Text>
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>
                {parseFloat(current.volume_l.toString()).toFixed(1)}L
              </Text>
              <Text style={styles.metricLabel}>Volume</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>
                {parseFloat(current.level_cm.toString()).toFixed(1)}cm
              </Text>
              <Text style={styles.metricLabel}>Level</Text>
            </View>
          </View>
          {current.temperature_c && (
            <Text style={styles.infoText}>
              Temperature: {parseFloat(current.temperature_c.toString()).toFixed(1)}°C
            </Text>
          )}
          {current.battery_v && (
            <Text style={styles.infoText}>
              Battery: {parseFloat(current.battery_v.toString()).toFixed(2)}V
            </Text>
          )}
        </View>
      )}

      {historyError && history.length === 0 && (
        <View style={styles.card}>
          <Text style={styles.title}>Volume History (7 days)</Text>
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No historical data available</Text>
            <Text style={styles.emptyStateSubtext}>
              Historical measurements will appear here once the device starts sending data.
            </Text>
          </View>
        </View>
      )}

      {history.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.title}>Volume History (7 days)</Text>
          <LineChart
            data={chartData}
            width={screenWidth - 40}
            height={220}
            chartConfig={{
              backgroundColor: '#fff',
              backgroundGradientFrom: '#fff',
              backgroundGradientTo: '#fff',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(0, 122, 255, ${opacity})`,
            }}
            bezier
            style={styles.chart}
          />
        </View>
      )}

      {!current && !history.length && !error && !currentError && !historyError && (
        <View style={styles.card}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No data available</Text>
            <Text style={styles.emptyStateSubtext}>
              This device hasn't sent any measurements yet.
            </Text>
          </View>
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
    backgroundColor: '#fff',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    paddingVertical: 5,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
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
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 20,
  },
  metric: {
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  metricLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F44336',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});


