/**
 * Reports Page Component
 * 
 * Report generation - Generate technical and customer-facing reports
 */

import { FileText } from 'lucide-react';

export function ReportsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
      <FileText className="h-16 w-16" />
      <h2 className="text-2xl font-semibold text-foreground">Reports</h2>
      <p className="text-center max-w-md">
        Generate technical and customer-facing reports.
        Document diagnostics, repairs, and recommendations.
      </p>
    </div>
  );
}
