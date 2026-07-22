import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export interface ExportableDevice {
  id: string;
  name: string;
  context?: string;
}

interface MeasurementExportDialogProps {
  devices: ExportableDevice[];
  endpoint: string;
}

function toDateTimeLocal(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { from: toDateTimeLocal(from), to: toDateTimeLocal(to) };
}

async function exportErrorMessage(error: any): Promise<string> {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.error) return parsed.error;
    } catch {
      // Fall back to the normal error below.
    }
  }
  return data?.error || error?.message || 'Failed to export measurements';
}

export default function MeasurementExportDialog({ devices, endpoint }: MeasurementExportDialogProps) {
  const initialRange = useMemo(defaultRange, []);
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setSelectedIds(devices.map((device) => device.id));
      setError('');
    }
  };

  const toggleDevice = (deviceId: string, checked: boolean) => {
    setSelectedIds((current) => checked
      ? [...new Set([...current, deviceId])]
      : current.filter((id) => id !== deviceId));
  };

  const handleExport = async () => {
    setError('');
    if (selectedIds.length === 0) {
      setError('Select at least one device.');
      return;
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (!from || !to || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || toDate <= fromDate) {
      setError('Choose a valid start and end time.');
      return;
    }

    setExporting(true);
    try {
      const response = await api.post(
        endpoint,
        {
          device_ids: selectedIds,
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `aquamind-measurements-${fromDate.toISOString().slice(0, 10)}_to_${toDate.toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (err: any) {
      setError(await exportErrorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="h-9" disabled={devices.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Export data
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export measurement timeline</DialogTitle>
          <DialogDescription>
            Download a CSV for the selected devices and time range. Times in the file are UTC; the fields below use your local time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="export-from">From</Label>
              <Input id="export-from" type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-to">To</Label>
              <Input id="export-to" type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>Devices ({selectedIds.length} selected)</Label>
              <div className="flex gap-3 text-xs">
                <button type="button" className="font-medium text-sky-700 hover:underline dark:text-sky-300" onClick={() => setSelectedIds(devices.map((device) => device.id))}>
                  Select all
                </button>
                <button type="button" className="font-medium text-slate-500 hover:underline dark:text-slate-400" onClick={() => setSelectedIds([])}>
                  Clear
                </button>
              </div>
            </div>
            <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {devices.map((device) => {
                const checked = selectedIds.includes(device.id);
                return (
                  <label key={device.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900">
                    <Checkbox checked={checked} onCheckedChange={(value) => toggleDevice(device.id, value === true)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{device.name}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {device.id}{device.context ? ` · ${device.context}` : ''}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              {error}
            </div>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Exports are limited to 366 days, 100 devices, and 100,000 rows. Narrow the range if the row limit is exceeded.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={exporting}>Cancel</Button>
          <Button type="button" onClick={handleExport} disabled={exporting || selectedIds.length === 0}>
            {exporting ? 'Preparing CSV…' : 'Download CSV'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
