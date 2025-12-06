'use client';

import Layout from '@/components/Layout';

export default function AnalyticsPage() {
  return (
    <Layout>
      <div className="px-4 py-6 sm:px-0">
        <h1 className="text-3xl font-bold mb-6">Analytics</h1>

        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">System Analytics</h2>
          <p className="text-gray-600">
            Analytics and reporting features will be available here.
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Anomaly Detection</h2>
          <p className="text-gray-600">
            Anomaly detection reports and alerts will be displayed here.
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">AI Batch Processing</h2>
          <p className="text-gray-600 mb-4">
            Future ML/AI batch processing features will be available here.
          </p>
          <div className="bg-gray-50 p-4 rounded-md">
            <p className="text-sm text-gray-500">
              This section is reserved for future AI/ML capabilities such as:
            </p>
            <ul className="list-disc list-inside mt-2 text-sm text-gray-500">
              <li>Usage pattern analysis</li>
              <li>Leak prediction models</li>
              <li>Seasonal consumption forecasting</li>
              <li>Batch anomaly detection</li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
}





