import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { calculatePercentage, formatBytes } from '@/types';

// ============================================================================
// Section Header Component
// ============================================================================

export function SectionHeader({ icon: Icon, title, iconColor }: {
  icon: React.ElementType;
  title: string;
  iconColor?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 pt-2">
      <Icon className={`h-5 w-5 ${iconColor || 'text-muted-foreground'}`} />
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
    </div>
  );
}

/**
 * Info row component for displaying label-value pairs
 */
export function InfoRow({ label, value, mono = false }: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center py-2 gap-4">
      <span className="text-muted-foreground text-sm shrink-0">{label}</span>
      <span className={`text-sm font-medium text-right ${mono ? 'font-mono' : ''}`}>
        {value || 'N/A'}
      </span>
    </div>
  );
}

/**
 * Usage bar component for memory/disk usage visualization
 */
export function UsageBar({
  label,
  used,
  total,
}: {
  label: string;
  used: number;
  total: number;
}) {
  const percentage = calculatePercentage(used, total);
  const isHigh = percentage > 85;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {formatBytes(used)} / {formatBytes(total)}
          <Badge
            variant={isHigh ? 'destructive' : 'secondary'}
            className="ml-2 text-xs"
          >
            {percentage}%
          </Badge>
        </span>
      </div>
      <Progress
        value={percentage}
        className={`h-2 ${isHigh ? '[&>div]:bg-destructive' : ''}`}
      />
    </div>
  );
}

/**
 * Loading skeleton for system info cards
 */
export function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-6">
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="grid gap-6 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * Refresh overlay skeleton (cross-fades over existing content)
 */
export function RefreshOverlay({ visible }: { visible: boolean }) {
  return (
    <div
      className={
        `absolute inset-0 pointer-events-none transition-opacity duration-300 ` +
        `${visible ? 'opacity-100' : 'opacity-0'}`
      }
      aria-hidden
    >
      <div className="absolute inset-0 bg-background/60" />
      <div className="relative p-6 grid gap-6 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
