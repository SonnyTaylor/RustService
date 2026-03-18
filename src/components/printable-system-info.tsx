import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SystemInfo, formatBytes } from '@/types';
import type { BusinessSettings } from '@/types/settings';

interface PrintableSystemInfoProps {
  systemInfo: SystemInfo;
  businessSettings?: BusinessSettings;
}

export function PrintableSystemInfo({ systemInfo, businessSettings }: PrintableSystemInfoProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Load business logo
  useEffect(() => {
    if (businessSettings?.logoPath) {
      invoke<string | null>('get_business_logo', { logoPath: businessSettings.logoPath })
        .then(url => setLogoUrl(url))
        .catch(() => setLogoUrl(null));
    } else {
      setLogoUrl(null);
    }
  }, [businessSettings?.logoPath]);

  const hasBusiness = businessSettings?.enabled && businessSettings?.name;
  const businessName = businessSettings?.name || 'RustService';
  const hostname = systemInfo.os.hostname || 'DEVICE';
  const systemIdentity = [
    systemInfo.systemProduct?.vendor,
    systemInfo.systemProduct?.model,
  ].filter(Boolean).join(' ');

  return (
    <div className="bg-white text-gray-800 p-8 min-h-[800px]" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header with Business Branding */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-start gap-4">
          {/* Business Logo */}
          {hasBusiness && (
            <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={businessName}
                  className="w-full h-full object-contain"
                  onError={() => setLogoUrl(null)}
                />
              ) : (
                <div className="w-full h-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
                  {businessName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{businessName}</h1>
            {hasBusiness && businessSettings?.address && (
              <p className="text-sm text-gray-600">{businessSettings.address}</p>
            )}
            {hasBusiness && (businessSettings?.phone || businessSettings?.email) && (
              <p className="text-sm text-gray-500">
                {businessSettings.phone && <span>{businessSettings.phone}</span>}
                {businessSettings.phone && businessSettings.email && <span> • </span>}
                {businessSettings.email && <span>{businessSettings.email}</span>}
              </p>
            )}
            {hasBusiness && businessSettings?.website && (
              <p className="text-sm text-blue-600">{businessSettings.website}</p>
            )}
            {hasBusiness && (businessSettings?.abn || businessSettings?.tfn) && (
              <p className="text-xs text-gray-400 mt-1">
                {businessSettings.abn && <span>ABN: {businessSettings.abn}</span>}
                {businessSettings.abn && businessSettings.tfn && <span> | </span>}
                {businessSettings.tfn && <span>TFN: {businessSettings.tfn}</span>}
              </p>
            )}
            {!hasBusiness && (
              <p className="text-sm text-blue-600 tracking-wide uppercase">System Specifications</p>
            )}
          </div>
        </div>

        {/* Device Details Box */}
        <div className="text-right p-4 border border-gray-200 rounded-lg bg-gray-50 min-w-[180px]">
          <p className="text-sm font-semibold text-gray-700 mb-2">Device Details</p>
          <p className="text-sm text-gray-500">
            <span className="text-gray-400">Device:</span> {hostname}
          </p>
          {systemIdentity && (
            <p className="text-sm text-gray-500">
              <span className="text-gray-400">System:</span> {systemIdentity}
            </p>
          )}
          <p className="text-sm text-gray-500">
            <span className="text-gray-400">Date:</span> {new Date().toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-gray-200 mb-6" />

      <h2 className="text-xl font-bold text-gray-900 mb-4">System Specifications</h2>

      <div className="space-y-6">
        {/* Operating System */}
        <section>
          <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-1 mb-3">Operating System</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Name:</span> <span className="font-medium">{systemInfo.os.name || 'N/A'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Version:</span> <span className="font-medium">{systemInfo.os.osVersion || 'N/A'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Build:</span> <span className="font-medium">{systemInfo.os.longOsVersion || 'N/A'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Kernel:</span> <span className="font-medium font-mono">{systemInfo.os.kernelVersion || 'N/A'}</span></div>
          </div>
        </section>

        {/* BIOS / Firmware */}
        {systemInfo.bios && (
          <section>
            <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-1 mb-3">BIOS / Firmware</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Manufacturer:</span> <span className="font-medium">{systemInfo.bios.manufacturer || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Version:</span> <span className="font-medium">{systemInfo.bios.version || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Release Date:</span> <span className="font-medium">{systemInfo.bios.releaseDate || 'N/A'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Serial:</span> <span className="font-medium font-mono">{systemInfo.bios.serialNumber || 'N/A'}</span></div>
            </div>
          </section>
        )}

        {/* Processor */}
        <section>
          <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-1 mb-3">Processor (CPU)</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="flex justify-between col-span-2"><span className="text-gray-500">Model:</span> <span className="font-medium">{systemInfo.cpu.brand}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Vendor:</span> <span className="font-medium">{systemInfo.cpu.vendorId}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Cores:</span> <span className="font-medium">{systemInfo.cpu.physicalCores ?? 'N/A'} Physical / {systemInfo.cpu.logicalCpus} Logical</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Base Speed:</span> <span className="font-medium">{systemInfo.cpu.frequencyMhz} MHz</span></div>
            {systemInfo.cpuSocket && (
              <div className="flex justify-between"><span className="text-gray-500">Socket:</span> <span className="font-medium">{systemInfo.cpuSocket}</span></div>
            )}
            {systemInfo.cpuL2CacheKb != null && (
              <div className="flex justify-between"><span className="text-gray-500">L2 Cache:</span> <span className="font-medium">{systemInfo.cpuL2CacheKb.toLocaleString()} KB</span></div>
            )}
            {systemInfo.cpuL3CacheKb != null && (
              <div className="flex justify-between"><span className="text-gray-500">L3 Cache:</span> <span className="font-medium">{(systemInfo.cpuL3CacheKb / 1024).toFixed(0)} MB</span></div>
            )}
          </div>
        </section>

        {/* Memory */}
        <section>
          <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-1 mb-3">Memory (RAM)</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Total:</span> <span className="font-medium">{formatBytes(systemInfo.memory.totalMemory)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Available:</span> <span className="font-medium">{formatBytes(systemInfo.memory.availableMemory)}</span></div>
          </div>
          {systemInfo.ramSlots.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium text-gray-700">Installed Modules:</p>
              {systemInfo.ramSlots.map((slot, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm bg-gray-50 p-2 rounded">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Slot:</span>
                    <span className="font-medium">{slot.deviceLocator || slot.bankLabel || `Slot ${idx + 1}`}</span>
                  </div>
                  {slot.capacityBytes != null && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Size:</span>
                      <span className="font-medium">{formatBytes(slot.capacityBytes)}</span>
                    </div>
                  )}
                  {slot.speedMhz != null && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Speed:</span>
                      <span className="font-medium">{slot.speedMhz} MHz</span>
                    </div>
                  )}
                  {slot.manufacturer && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Manufacturer:</span>
                      <span className="font-medium">{slot.manufacturer}</span>
                    </div>
                  )}
                  {slot.partNumber && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Part Number:</span>
                      <span className="font-medium font-mono">{slot.partNumber}</span>
                    </div>
                  )}
                  {slot.memoryType && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Type:</span>
                      <span className="font-medium">{slot.memoryType}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Motherboard */}
        {systemInfo.motherboard && (
          <section>
            <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-1 mb-3">Motherboard</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Vendor:</span> <span className="font-medium">{systemInfo.motherboard.vendor || 'Unknown'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Model:</span> <span className="font-medium">{systemInfo.motherboard.name || 'Unknown'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Version:</span> <span className="font-medium">{systemInfo.motherboard.version || 'Unknown'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Serial:</span> <span className="font-medium">{systemInfo.motherboard.serialNumber || 'Unknown'}</span></div>
            </div>
          </section>
        )}

        {/* Graphics */}
        {systemInfo.gpu && (
          <section>
            <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-1 mb-3">Graphics (GPU)</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="flex justify-between col-span-2"><span className="text-gray-500">Model:</span> <span className="font-medium">{systemInfo.gpu.model}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Vendor:</span> <span className="font-medium">{systemInfo.gpu.vendor}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">VRAM:</span> <span className="font-medium">{formatBytes(systemInfo.gpu.totalVram)}</span></div>
            </div>
          </section>
        )}

        {/* Storage */}
        {systemInfo.disks.length > 0 && (
          <section>
            <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-1 mb-3">Storage Drives</h3>
            <div className="space-y-3">
              {systemInfo.disks.map((disk, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm bg-gray-50 p-3 rounded">
                  <div className="flex justify-between col-span-2">
                    <span className="text-gray-500">Drive {disk.name || 'Local Disk'}:</span>
                    <span className="font-medium">{disk.mountPoint} ({disk.fileSystem})</span>
                  </div>
                  <div className="flex justify-between"><span className="text-gray-500">Type:</span> <span className="font-medium">{disk.diskType} {disk.isRemovable ? '(Removable)' : ''}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Capacity:</span> <span className="font-medium">{formatBytes(disk.totalSpace)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Free Space:</span> <span className="font-medium">{formatBytes(disk.availableSpace)}</span></div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Network */}
        {systemInfo.networks.length > 0 && (
          <section>
            <h3 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-1 mb-3">Network Adapters</h3>
            <div className="grid grid-cols-1 gap-2 text-sm">
              {systemInfo.networks.map((net, idx) => (
                <div key={idx} className="flex justify-between bg-gray-50 p-2 rounded">
                  <span className="font-medium">{net.name}</span>
                  <span className="text-gray-500 font-mono">{net.macAddress}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="mt-12 text-center text-xs text-gray-400">
        Generated by RustService
      </div>
    </div>
  );
}
