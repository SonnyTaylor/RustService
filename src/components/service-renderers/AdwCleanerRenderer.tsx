/**
 * AdwCleaner Service Renderer
 *
 * Custom renderer for the adwcleaner service results.
 * Shows cleanup results with category breakdown.
 */

import { Sparkles, Check, AlertTriangle, FolderOpen, FileX, Settings, Clock, Chrome, FileCode } from 'lucide-react';
import { Bar, BarChart, XAxis, YAxis, Cell, LabelList } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface CategoryData {
  name: string;
  count: number;
  items: string[];
}

interface AdwCleanerSummaryData {
  type: 'adwcleaner_summary';
  cleaned: number;
  failed: number;
  registry: number;
  files: number;
  folders: number;
  services: number;
  tasks: number;
  shortcuts: number;
  dlls: number;
  wmi: number;
  browsers: Record<string, number>;
  preinstalled: number;
  categories: CategoryData[];
}

// =============================================================================
// Helper Functions
// =============================================================================

function getCategoryColor(name: string): string {
  const colors: Record<string, string> = {
    'Registry': 'hsl(280, 70%, 50%)',
    'Files': 'hsl(200, 70%, 50%)',
    'Folders': 'hsl(170, 70%, 45%)',
    'Services': 'hsl(340, 70%, 50%)',
    'Tasks': 'hsl(30, 80%, 50%)',
    'Shortcuts': 'hsl(60, 70%, 45%)',
    'DLLs': 'hsl(220, 70%, 50%)',
    'WMI': 'hsl(140, 60%, 45%)',
    'Preinstalled Software': 'hsl(0, 70%, 50%)',
  };
  return colors[name] || 'hsl(220, 14%, 46%)';
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  // Extract summary data from findings
  const summaryFinding = result.findings.find(
    (f) => (f.data as AdwCleanerSummaryData | undefined)?.type === 'adwcleaner_summary'
  );
  const summaryData = summaryFinding?.data as AdwCleanerSummaryData | undefined;

  // Error state
  if (!summaryData) {
    const errorFinding = result.findings.find((f) => f.severity === 'error');
    return (
      <Card className="overflow-hidden pt-0">
        <CardHeader className="py-4 bg-gradient-to-r from-cyan-500/10 to-teal-500/10">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            Adware Cleanup
            <span className="ml-auto px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-500">
              FAILED
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="font-medium text-red-500">{errorFinding?.title || 'Cleanup Failed'}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {errorFinding?.description || result.error || 'Could not complete cleanup'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { cleaned, failed, categories } = summaryData;
  const isClean = cleaned === 0 && failed === 0 && categories.length === 0;
  const hasIssues = failed > 0;

  // Prepare chart data from categories
  const chartData = categories
    .filter((c) => c.count > 0)
    .map((c) => ({
      name: c.name,
      value: c.count,
      fill: getCategoryColor(c.name),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8); // Limit to 8 bars

  const chartConfig: ChartConfig = {
    value: {
      label: 'Items',
      color: 'var(--chart-1)',
    },
  };

  const totalCleaned = categories.reduce((acc, c) => acc + c.count, 0);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden pt-0">
        <CardHeader className="py-4 bg-gradient-to-r from-cyan-500/10 to-teal-500/10">
          <CardTitle className="text-base flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isClean ? 'bg-green-500/20' : 'bg-cyan-500/20'}`}>
              {isClean ? (
                <Check className="h-5 w-5 text-green-500" />
              ) : (
                <Sparkles className="h-5 w-5 text-cyan-500" />
              )}
            </div>
            Adware Cleanup
            <span
              className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${
                isClean
                  ? 'bg-green-500/10 text-green-500'
                  : hasIssues
                    ? 'bg-yellow-500/10 text-yellow-500'
                    : 'bg-cyan-500/10 text-cyan-500'
              }`}
            >
              {isClean ? 'CLEAN' : hasIssues ? 'PARTIAL' : 'ITEMS CLEANED'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="p-4 rounded-xl bg-muted/50 border text-center">
              <p className="text-muted-foreground text-sm">Categories</p>
              <p className="text-2xl font-bold mt-1">{categories.length}</p>
            </div>
            <div className="p-4 rounded-xl bg-muted/50 border text-center">
              <p className="text-muted-foreground text-sm">Items Cleaned</p>
              <p className="text-2xl font-bold mt-1 text-cyan-500">{totalCleaned}</p>
            </div>
            <div className="p-4 rounded-xl bg-muted/50 border text-center">
              <p className="text-muted-foreground text-sm">Status</p>
              <p className={`text-xl font-bold mt-1 ${isClean ? 'text-green-500' : hasIssues ? 'text-yellow-500' : 'text-cyan-500'}`}>
                {isClean ? 'Clean' : hasIssues ? 'Partial' : 'Done'}
              </p>
            </div>
          </div>

          {/* Category Chart */}
          {chartData.length > 0 && (
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ left: 10, right: 60 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={120}
                  tick={{ fontSize: 12 }}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent formatter={(value) => `${value} items`} hideLabel />}
                />
                <Bar dataKey="value" radius={[4, 4, 4, 4]} maxBarSize={25}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="right"
                    formatter={(value: number) => value.toString()}
                    className="fill-foreground"
                    fontSize={12}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}

          {/* Clean state message */}
          {isClean && (
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-3">
              <Check className="h-5 w-5 text-green-500" />
              <div>
                <p className="font-medium text-green-700 dark:text-green-300">System is Clean</p>
                <p className="text-sm text-muted-foreground">No adware or PUPs were detected</p>
              </div>
            </div>
          )}

          {/* Category Details */}
          {categories.length > 0 && (
            <div className="mt-4 space-y-2">
              <h4 className="text-sm font-medium">Cleaned Items by Category</h4>
              <div className="grid grid-cols-2 gap-2">
                {categories.slice(0, 6).map((cat) => (
                  <div
                    key={cat.name}
                    className="p-3 rounded-lg bg-muted/30 border flex items-center gap-2"
                  >
                    {cat.name === 'Registry' && <Settings className="h-4 w-4 text-purple-500" />}
                    {cat.name === 'Files' && <FileX className="h-4 w-4 text-blue-500" />}
                    {cat.name === 'Folders' && <FolderOpen className="h-4 w-4 text-teal-500" />}
                    {cat.name === 'Services' && <Settings className="h-4 w-4 text-pink-500" />}
                    {cat.name === 'Tasks' && <Clock className="h-4 w-4 text-orange-500" />}
                    {cat.name === 'DLLs' && <FileCode className="h-4 w-4 text-indigo-500" />}
                    {cat.name.includes('Chromium') && <Chrome className="h-4 w-4 text-blue-500" />}
                    <span className="text-sm flex-1 truncate">{cat.name}</span>
                    <span className="text-sm font-medium">{cat.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warning for failed items */}
          {failed > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
              <span className="text-sm text-yellow-700 dark:text-yellow-300">
                {failed} item{failed !== 1 ? 's' : ''} could not be removed. Manual review may be required.
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Customer Print Variant
// =============================================================================

function CustomerRenderer({ result }: ServiceRendererProps) {
  const summaryFinding = result.findings.find(
    (f) => (f.data as AdwCleanerSummaryData | undefined)?.type === 'adwcleaner_summary'
  );
  const summaryData = summaryFinding?.data as AdwCleanerSummaryData | undefined;

  if (!summaryData) {
    return (
      <div className="p-4 border border-gray-200 rounded-lg bg-white">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
              Adware Cleanup
            </p>
            <p className="text-xl font-bold text-gray-900">Cleanup Failed</p>
            <p className="text-sm text-gray-500">{result.error || 'Could not complete cleanup'}</p>
          </div>
          <div className="text-2xl text-red-500">✗</div>
        </div>
      </div>
    );
  }

  const { cleaned, failed, categories } = summaryData;
  const totalItems = categories.reduce((acc, c) => acc + c.count, 0);
  const isClean = totalItems === 0;
  const hasIssues = failed > 0;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isClean ? 'bg-green-100' : 'bg-cyan-100'}`}>
          {isClean ? (
            <Check className="h-5 w-5 text-green-600" />
          ) : (
            <Sparkles className="h-5 w-5 text-cyan-600" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
            Adware Cleanup
          </p>
          <p className="text-xl font-bold text-gray-900">
            {isClean ? 'System Clean' : `${totalItems} Items Cleaned`}
          </p>
          <p className="text-sm text-gray-500">
            {isClean
              ? 'No adware or unwanted programs found'
              : `Removed items from ${categories.length} categor${categories.length !== 1 ? 'ies' : 'y'}`}
          </p>
          {hasIssues && (
            <p className="text-sm text-yellow-600 mt-1">
              ⚠ {failed} item{failed !== 1 ? 's' : ''} could not be removed
            </p>
          )}
        </div>
        <div className={`text-2xl ${isClean ? 'text-green-500' : hasIssues ? 'text-yellow-500' : 'text-cyan-500'}`}>
          {isClean ? '✓' : hasIssues ? '⚠' : '✓'}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

export function AdwCleanerRenderer(props: ServiceRendererProps) {
  const { variant } = props;

  if (variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }

  return <FindingsRenderer {...props} />;
}
