/**
 * Service Knowledge Base
 * 
 * Maps common user symptoms/complaints to recommended services.
 * This is injected into the agent's system prompt so it can
 * intelligently suggest service queues based on conversation context.
 */

export interface ServiceRecommendation {
  /** Symptom keywords/phrases that trigger this recommendation */
  symptoms: string[];
  /** Service IDs to recommend */
  services: string[];
  /** Explanation for why these services are recommended */
  reason: string;
  /** Priority: higher = suggest first */
  priority: number;
}

export const SERVICE_RECOMMENDATIONS: ServiceRecommendation[] = [
  {
    symptoms: ['slow', 'sluggish', 'lag', 'takes forever', 'freezing', 'unresponsive', 'performance'],
    services: ['disk-space', 'bleachbit', 'sfc', 'dism', 'drivecleanup', 'installed-software', 'driver-audit'],
    reason: 'Performance issues often stem from disk space, corrupted system files, or outdated drivers',
    priority: 10,
  },
  {
    symptoms: ['crash', 'bsod', 'blue screen', 'restart', 'stop error', 'bugcheck'],
    services: ['chkdsk', 'sfc', 'dism', 'driver-audit', 'smartctl', 'battery-report'],
    reason: 'Crashes can indicate disk errors, corrupted system files, driver issues, or hardware failure',
    priority: 10,
  },
  {
    symptoms: ['virus', 'malware', 'infected', 'suspicious', 'popup', 'adware', 'ransomware', 'security'],
    services: ['kvrt-scan', 'adwcleaner', 'stinger', 'bleachbit'],
    reason: 'Security threats require multi-engine scanning and cleanup of cached malware artifacts',
    priority: 10,
  },
  {
    symptoms: ['internet', 'wifi', 'network', 'connection', 'disconnect', 'no internet', 'dns', 'slow download'],
    services: ['ping-test', 'speedtest', 'network-config'],
    reason: 'Network issues need connectivity testing, speed measurement, and configuration review',
    priority: 9,
  },
  {
    symptoms: ['battery', 'charge', 'draining', 'power', 'dies fast', 'not charging', 'battery life'],
    services: ['battery-report', 'energy-report'],
    reason: 'Battery concerns require health checks, usage reports, and energy efficiency analysis',
    priority: 8,
  },
  {
    symptoms: ['disk', 'storage', 'full', 'space', 'hard drive', 'ssd', 'hdd'],
    services: ['disk-space', 'smartctl', 'bleachbit', 'drivecleanup', 'chkdsk'],
    reason: 'Storage issues need space analysis, drive health checks, and cleanup',
    priority: 8,
  },
  {
    symptoms: ['update', 'windows update', 'patch', 'outdated', 'version'],
    services: ['windows-update', 'driver-audit', 'sfc', 'dism'],
    reason: 'Update issues often need Windows Update management and system file repair',
    priority: 7,
  },
  {
    symptoms: ['driver', 'hardware', 'device', 'not working', 'not detected', 'missing driver'],
    services: ['driver-audit', 'dism', 'sfc'],
    reason: 'Hardware/driver issues require driver auditing and system integrity checks',
    priority: 7,
  },
  {
    symptoms: ['startup', 'boot', 'long boot', 'slow startup', 'takes long to start'],
    services: ['disk-space', 'bleachbit', 'sfc', 'dism', 'installed-software'],
    reason: 'Slow boot can be caused by disk issues, too many startup items, or corrupted system files',
    priority: 7,
  },
  {
    symptoms: ['hot', 'overheating', 'temperature', 'fan', 'thermal', 'throttle'],
    services: ['heavyload', 'battery-report', 'energy-report', 'furmark'],
    reason: 'Thermal issues need stress testing to identify cooling problems',
    priority: 6,
  },
  {
    symptoms: ['gpu', 'graphics', 'display', 'screen', 'artifact', 'render'],
    services: ['furmark', 'driver-audit'],
    reason: 'Graphics issues need GPU stress testing and driver verification',
    priority: 6,
  },
  {
    symptoms: ['general', 'checkup', 'health check', 'full check', 'everything', 'diagnostic', 'assessment'],
    services: ['ping-test', 'disk-space', 'sfc', 'dism', 'chkdsk', 'driver-audit', 'battery-report', 'smartctl', 'installed-software', 'network-config'],
    reason: 'General health check covers core diagnostics across all subsystems',
    priority: 5,
  },
  {
    symptoms: ['cleanup', 'clean', 'junk', 'temporary', 'temp files', 'clear'],
    services: ['bleachbit', 'drivecleanup', 'disk-space'],
    reason: 'Cleanup tasks to free space and remove temporary/junk files',
    priority: 6,
  },
  {
    symptoms: ['upgrade', 'windows 11', 'compatible', 'compatibility', 'can i run'],
    services: ['whynotwin11', 'driver-audit', 'disk-space'],
    reason: 'Compatibility checking for Windows 11 upgrade eligibility',
    priority: 5,
  },
  {
    symptoms: ['benchmark', 'test', 'score', 'rating', 'speed test'],
    services: ['winsat', 'speedtest', 'iperf', 'heavyload', 'furmark'],
    reason: 'Benchmarking tools to measure system performance',
    priority: 5,
  },
];

/**
 * Generate the service knowledge section for the system prompt.
 * Returns a formatted string mapping symptoms to service recommendations.
 */
export function getServiceKnowledgePrompt(): string {
  const lines = [
    'SERVICE RECOMMENDATION KNOWLEDGE:',
    'When the user describes a problem, suggest services based on these mappings:',
    '',
  ];

  for (const rec of SERVICE_RECOMMENDATIONS.sort((a, b) => b.priority - a.priority)) {
    lines.push(`• Symptoms: ${rec.symptoms.join(', ')}`);
    lines.push(`  Services: ${rec.services.join(', ')}`);
    lines.push(`  Reason: ${rec.reason}`);
    lines.push('');
  }

  return lines.join('\n');
}
