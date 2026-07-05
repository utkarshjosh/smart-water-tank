import DeviceDetailClient from './DeviceDetailClient';

export async function generateStaticParams(): Promise<{ deviceId: string }[]> {
  return [];
}

export default function DeviceDetailPage() {
  return <DeviceDetailClient />;
}
