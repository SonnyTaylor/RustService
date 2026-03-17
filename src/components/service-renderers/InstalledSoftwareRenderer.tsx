/**
 * Installed Software Renderer
 *
 * Custom renderer for software audit results.
 * Shows program list with sizes, versions, and recent installations.
 */

import { useState } from 'react';
import { PackageSearch, Search, ArrowUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ServiceCardWrapper } from './ServiceCardWrapper';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface ProgramEntry {
  name: string;
  version: string;
  publisher: string;
  installDate: string;
  sizeMb: number;
}

interface TopEntry {
  name: string;
  sizeMb: number;
}

interface RecentEntry {
  name: string;
  version: string;
  installDate: string;
}

interface SoftwareData {
  type: 'installed_software';
  totalPrograms: number;
  totalSizeMb: number;
  programs: ProgramEntry[];
  topBySize: TopEntry[];
  recentlyInstalled: RecentEntry[];
  includeUpdates: boolean;
  error?: boolean;
}

type SortKey = 'name' | 'size' | 'date' | 'publisher';

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ definition, result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as SoftwareData | undefined;
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('size');
  const [showAll, setShowAll] = useState(false);

  if (!data || data.type !== 'installed_software') return null;
  if (data.error) return null;

  const filteredPrograms = data.programs
    .filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.publisher.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name);
        case 'size': return b.sizeMb - a.sizeMb;
        case 'date': return b.installDate.localeCompare(a.installDate);
        case 'publisher': return a.publisher.localeCompare(b.publisher);
        default: return 0;
      }
    });

  const displayPrograms = showAll ? filteredPrograms : filteredPrograms.slice(0, 50);

  return (
    <ServiceCardWrapper
      definition={definition}
      result={result}
      statusBadge={{ label: `${data.totalPrograms} Programs`, color: 'blue' }}
    >
      <div className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-muted/30 border text-center">
            <p className="text-2xl font-bold">{data.totalPrograms}</p>
            <p className="text-xs text-muted-foreground">Programs</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border text-center">
            <p className="text-2xl font-bold">{data.totalSizeMb >= 1024 ? `${(data.totalSizeMb / 1024).toFixed(1)}` : data.totalSizeMb.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">{data.totalSizeMb >= 1024 ? 'GB Total' : 'MB Total'}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border text-center">
            <p className="text-2xl font-bold">{data.recentlyInstalled.length}</p>
            <p className="text-xs text-muted-foreground">Recent</p>
          </div>
        </div>

        {/* Top by Size */}
        {data.topBySize.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Largest Programs</p>
            <div className="space-y-1">
              {data.topBySize.slice(0, 5).map((prog, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                      <span className="text-sm truncate">{prog.name}</span>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                    {prog.sizeMb >= 1024 ? `${(prog.sizeMb / 1024).toFixed(1)} GB` : `${prog.sizeMb.toFixed(0)} MB`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search + Sort */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search programs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 whitespace-nowrap"
            onClick={() => {
              const cycle: SortKey[] = ['size', 'name', 'date', 'publisher'];
              const next = cycle[(cycle.indexOf(sortBy) + 1) % cycle.length];
              setSortBy(next);
            }}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortBy === 'size' ? 'Size' : sortBy === 'name' ? 'Name' : sortBy === 'date' ? 'Date' : 'Publisher'}
          </Button>
        </div>

        {/* Program List */}
        <div className="max-h-96 overflow-y-auto space-y-1">
          {displayPrograms.map((prog, i) => (
            <div key={i} className="p-2 rounded-lg bg-muted/20 border text-sm flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{prog.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {[prog.version, prog.publisher, prog.installDate].filter(Boolean).join(' · ')}
                </p>
              </div>
              {prog.sizeMb > 0 && (
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {prog.sizeMb >= 1024 ? `${(prog.sizeMb / 1024).toFixed(1)} GB` : `${prog.sizeMb.toFixed(0)} MB`}
                </span>
              )}
            </div>
          ))}
        </div>

        {!showAll && filteredPrograms.length > 50 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setShowAll(true)}
          >
            Show all {filteredPrograms.length} programs
          </Button>
        )}
      </div>
    </ServiceCardWrapper>
  );
}

// =============================================================================
// Customer Print Variant
// =============================================================================

function CustomerRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as SoftwareData | undefined;

  if (!data || data.type !== 'installed_software') return null;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-blue-100">
          <PackageSearch className="h-5 w-5 text-blue-600" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-800">
            Software Inventory: {data.totalPrograms} Programs
          </p>
          <p className="text-sm text-gray-500">
            Total estimated disk usage: {data.totalSizeMb >= 1024 ? `${(data.totalSizeMb / 1024).toFixed(1)} GB` : `${data.totalSizeMb.toFixed(0)} MB`}
          </p>
        </div>
        <div className="text-2xl text-blue-500">{data.totalPrograms}</div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

export function InstalledSoftwareRenderer(props: ServiceRendererProps) {
  if (props.variant === 'customer') return <CustomerRenderer {...props} />;
  return <FindingsRenderer {...props} />;
}
