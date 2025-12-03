import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { LineChart } from 'react-native-chart-kit';
import { Dimensions } from 'react-native';
import api from '../config/api';

const screenWidth = Dimensions.get('window').width;

export default function DeviceDetailScreen() {
  const route = useRoute();
  const { deviceId } = route.params as { deviceId: string };
  const [current, setCurrent] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [deviceId]);

  const fetchData = async () => {
    try {
      const [currentRes, historyRes] = await Promise.all([
        api.get(`/api/v1/user/devices/${deviceId}/current`),
        api.get(`/api/v1/user/devices/${deviceId}/history?days=7&limit=100`),
      ]);
      setCurrent(currentRes.data);
      setHistory(historyRes.data.measurements || []);
    } catch (error) {
      console.error('Failed to fetch device data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
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
      {current && (
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
});


