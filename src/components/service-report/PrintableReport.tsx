/**
 * PrintableReport Component
 *
 * Renders a printer-friendly report in either 'detailed' (technician) or
 * 'customer' variant. Used for both print and PDF export.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Wrench } from 'lucide-react';

import type {
  ServiceReport,
  ServiceDefinition,
} from '@/types/service';
import type { BusinessSettings } from '@/types/settings';
import { getServiceRenderer } from '@/components/service-renderers';
import { getIcon } from '@/components/service/utils';
import { categoryLabels } from '@/components/service-report/report-constants';

export interface PrintableReportProps {
  report: ServiceReport;
  definitions: ServiceDefinition[];
  variant: 'detailed' | 'customer';
  businessSettings?: BusinessSettings;
}

export function PrintableReport({ report, definitions, variant, businessSettings }: PrintableReportProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const definitionMap = new Map(definitions.map((d) => [d.id, d]));

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

  const totalDuration = report.totalDurationMs ? (report.totalDurationMs / 1000).toFixed(1) : '?';
  const successCount = report.results.filter((r) => r.success).length;
  const totalCount = report.results.length;

  // Get hostname for customer print
  const hostname = typeof window !== 'undefined' ? 'DESKTOP' : 'DEVICE';

  // Group findings by category
  const findingsByCategory = report.results.reduce((acc, result) => {
    const def = definitionMap.get(result.serviceId);
    const category = def?.category || 'other';
    const updated = { ...acc };
    if (!updated[category]) updated[category] = [];
    updated[category] = [...updated[category], { result, definition: def }];
    return updated;
  }, {} as Record<string, { result: typeof report.results[0]; definition: ServiceDefinition | undefined }[]>);

  if (variant === 'customer') {
    return (
      <CustomerReport
        report={report}
        definitions={definitions}
        definitionMap={definitionMap}
        findingsByCategory={findingsByCategory}
        businessSettings={businessSettings}
        logoUrl={logoUrl}
        setLogoUrl={setLogoUrl}
        successCount={successCount}
        totalCount={totalCount}
        totalDuration={totalDuration}
        hostname={hostname}
      />
    );
  }

  // Detailed variant
  return (
    <div className="bg-white text-black p-8 min-h-[800px]" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div className="text-center mb-6 pb-4 border-b-2 border-gray-200">
        <h1 className="text-2xl font-bold text-gray-800">Service Report</h1>
        <p className="text-gray-500 text-sm">{new Date(report.startedAt).toLocaleString()}</p>
      </div>

      {/* Summary Box */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-gray-800">{totalCount}</p>
            <p className="text-xs text-gray-500 uppercase">Services Run</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{successCount}</p>
            <p className="text-xs text-gray-500 uppercase">Successful</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{totalDuration}s</p>
            <p className="text-xs text-gray-500 uppercase">Duration</p>
          </div>
        </div>
      </div>

      {/* Service Results */}
      {report.results.map((result) => {
        const def = definitionMap.get(result.serviceId);
        return (
          <div key={result.serviceId} className="mb-6">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200">
              <span className={result.success ? 'text-green-500' : 'text-red-500'}>
                {result.success ? '\u2713' : '\u2717'}
              </span>
              <h3 className="font-bold text-gray-800">{def?.name || result.serviceId}</h3>
              <span className="text-gray-400 text-sm ml-auto">
                {(result.durationMs / 1000).toFixed(1)}s
              </span>
            </div>
            {result.findings.map((finding, idx) => (
              <div key={idx} className="ml-6 mb-2 text-sm">
                <p className="text-gray-700">
                  <span className="font-medium">[{finding.severity.toUpperCase()}]</span>{' '}
                  {finding.title}
                </p>
                <p className="text-gray-500 ml-4">{finding.description}</p>
              </div>
            ))}
            {result.error && (
              <div className="ml-6 text-red-600 text-sm">Error: {result.error}</div>
            )}
          </div>
        );
      })}

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-gray-200 text-center text-gray-400 text-sm">
        <p>RustService Report &bull; {report.id}</p>
      </div>
    </div>
  );
}

// =============================================================================
// Customer Report sub-component (kept private to this module)
// =============================================================================

interface CustomerReportProps {
  report: ServiceReport;
  definitions: ServiceDefinition[];
  definitionMap: Map<string, ServiceDefinition>;
  findingsByCategory: Record<string, { result: ServiceReport['results'][0]; definition: ServiceDefinition | undefined }[]>;
  businessSettings?: BusinessSettings;
  logoUrl: string | null;
  setLogoUrl: (url: string | null) => void;
  successCount: number;
  totalCount: number;
  totalDuration: string;
  hostname: string;
}

function CustomerReport({
  report,
  definitionMap,
  findingsByCategory,
  businessSettings,
  logoUrl,
  setLogoUrl,
  successCount,
  totalCount,
  totalDuration,
  hostname,
}: CustomerReportProps) {
  const hasBusiness = businessSettings?.enabled && businessSettings?.name;
  const businessName = businessSettings?.name || 'RustService';

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
                {businessSettings.phone && businessSettings.email && <span> &bull; </span>}
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
              <p className="text-sm text-blue-600 tracking-wide uppercase">Customer Service Summary</p>
            )}
          </div>
        </div>

        {/* Service Details Box */}
        <div className="text-right p-4 border border-gray-200 rounded-lg bg-gray-50 min-w-[180px]">
          <p className="text-sm font-semibold text-gray-700 mb-2">Service Details</p>
          {report.technicianName && (
            <p className="text-sm text-gray-600">
              <span className="text-gray-400">Technician:</span> {report.technicianName}
            </p>
          )}
          {report.customerName && (
            <p className="text-sm text-gray-600">
              <span className="text-gray-400">Customer:</span> {report.customerName}
            </p>
          )}
          <p className="text-sm text-gray-500">
            <span className="text-gray-400">Device:</span> {hostname}
          </p>
          <p className="text-sm text-gray-500">
            <span className="text-gray-400">Date:</span> {new Date(report.startedAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-gray-200 mb-6" />

      {/* Status Row */}
      <div className="flex items-center justify-between mb-4">
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
          successCount === totalCount
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
        }`}>
          <span>{successCount === totalCount ? '\u2713' : '\u26A0'}</span>
          {successCount === totalCount ? 'All Tasks Successful' : 'Attention Required'}
        </div>
        <p className="text-sm text-gray-500">
          {totalCount} tasks &bull; {totalDuration}s
        </p>
      </div>

      {/* Description */}
      <p className="text-gray-500 text-sm mb-6">
        Here's a concise overview of the maintenance and diagnostics completed during your visit.
      </p>

      {/* Results by Category */}
      {Object.entries(findingsByCategory).map(([category, items]) => (
        <div key={category} className="mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-3">
            {categoryLabels[category] || category}
          </h2>
          <div className="space-y-3">
            {items.map(({ result, definition }) => {
              const CustomRenderer = getServiceRenderer(result.serviceId);

              // Use custom customer renderer if available
              if (CustomRenderer && definition) {
                return (
                  <CustomRenderer
                    key={result.serviceId}
                    result={result}
                    definition={definition}
                    variant="customer"
                  />
                );
              }

              // Fallback to generic renderer
              const mainFinding = result.findings[0];
              const Icon = definition ? getIcon(definition.icon) : Wrench;

              return (
                <div
                  key={result.serviceId}
                  className="p-4 border border-gray-200 rounded-lg bg-white"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-gray-100 text-gray-500">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
                        {definition?.name || result.serviceId}
                      </p>
                      {mainFinding && (
                        <>
                          <p className="text-xl font-bold text-gray-900">
                            {mainFinding.title}
                          </p>
                          <p className="text-sm text-gray-500">
                            {mainFinding.description}
                          </p>
                        </>
                      )}
                      {result.findings.length > 1 && (
                        <ul className="mt-2 space-y-1">
                          {result.findings.slice(1).map((f, idx) => (
                            <li key={idx} className="text-sm text-gray-600 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                              {f.title}
                            </li>
                          ))}
                        </ul>
                      )}
                      {result.error && (
                        <p className="text-sm text-red-600 mt-1">Error: {result.error}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-gray-200 text-center text-gray-400 text-xs">
        Report generated by RustService
      </div>
    </div>
  );
}
