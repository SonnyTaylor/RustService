/**
 * Service Renderer Registry
 *
 * Maps service IDs to custom React render components for:
 * - `findings` (interactive UI in results view)
 * - `customer` (simplified print for customers)
 *
 * Services without a custom renderer fall back to the generic renderer.
 */

import React from 'react';
import type { ServiceResult, ServiceDefinition } from '@/types/service';

// Import custom renderers
import { PingTestRenderer } from './PingTestRenderer';

// =============================================================================
// Types
// =============================================================================

export type ServiceRendererVariant = 'findings' | 'customer';

export interface ServiceRendererProps {
  result: ServiceResult;
  definition: ServiceDefinition;
  variant: ServiceRendererVariant;
}

export type ServiceRenderer = React.FC<ServiceRendererProps>;

// =============================================================================
// Renderer Registry
// =============================================================================

/**
 * Registry mapping service IDs to their custom renderers.
 * Add new service renderers here.
 */
export const SERVICE_RENDERERS: Partial<Record<string, ServiceRenderer>> = {
  'ping-test': PingTestRenderer,
  // Add more service renderers here:
  // 'disk-space': DiskSpaceRenderer,
  // 'cpu-stress': CpuStressRenderer,
};

/**
 * Get the renderer for a service.
 * Returns undefined if no custom renderer exists (use generic).
 */
export function getServiceRenderer(serviceId: string): ServiceRenderer | undefined {
  return SERVICE_RENDERERS[serviceId];
}

/**
 * Check if a service has a custom renderer.
 */
export function hasCustomRenderer(serviceId: string): boolean {
  return serviceId in SERVICE_RENDERERS;
}
