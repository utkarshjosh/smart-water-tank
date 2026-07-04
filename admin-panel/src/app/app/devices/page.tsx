'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, PlusCircle, Droplets } from 'lucide-react';

interface Device {
  id: string;
  name: string;
  status: string;
  firmware_version: string;
  last_seen: string;
  current_volume: number | null;
  last_measurement: string | null;
}

export default function TenantDevicesPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/v1/user/devices')
      .then(({ data }) => setDevices(data.devices))
      .catch((err) => setError(err.response?.data?.error || err.message || 'Failed to fetch devices'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">My Devices</h1>
        <Button onClick={() => router.push('/app/onboarding')}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Device
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {devices.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12 flex flex-col items-center text-center gap-4">
            <Droplets className="h-10 w-10 text-primary" />
            <div>
              <p className="font-medium">No devices yet</p>
              <p className="text-sm text-muted-foreground">Pair your first AquaMind sensor to start seeing live data.</p>
            </div>
            <Button onClick={() => router.push('/app/onboarding')}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Pair your first device
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {devices.map((device) => (
            <Card key={device.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`h-3 w-3 rounded-full ${device.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <div>
                      <div className="font-medium">{device.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {device.last_measurement ? `Last reading ${new Date(device.last_measurement).toLocaleString()}` : 'No data yet'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="font-medium">
                      {device.current_volume !== null && device.current_volume !== undefined
                        ? `${Number(device.current_volume).toFixed(1)}L`
                        : 'N/A'}
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        device.status === 'online'
                          ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
                          : 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-400'
                      }
                    >
                      {device.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
