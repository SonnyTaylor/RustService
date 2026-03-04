/**
 * Results View Component
 *
 * Wrapper around ServiceReportView for the service page results phase.
 */

import type { ServiceReport, ServiceDefinition } from '@/types/service';
import { ServiceReportView } from '@/components/service-report-view';

// =============================================================================
// Types
// =============================================================================

export interface ResultsViewProps {
  report: ServiceReport;
  definitions: ServiceDefinition[];
  onNewService: () => void;
  onBack: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function ResultsView({ report, definitions, onNewService, onBack }: ResultsViewProps) {
  return (
    <ServiceReportView
      report={report}
      definitions={definitions}
      onBack={onBack}
      onNewService={onNewService}
      headerTitle="Service Complete"
      backButtonLabel="Back to Presets"
    />
  );
}
