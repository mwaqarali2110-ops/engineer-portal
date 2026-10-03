/** Platform-neutral hardware contract. Missing configuration preserves legacy behavior.
 * Battery ports and expansion maximum describe the complete selected inverter bank:
 * never multiply them implicitly by inverter count. */
export type HardwarePhase = 'single' | 'three';
export type HardwareSource = 'inverter_parallel' | 'battery_expansion' | 'battery_parallel';
export type HardwareCategory = 'Parallel Device' | 'Communication Device' | 'Battery Junction Box' | 'Battery Communication Device' | 'Other';
export type HardwareRule = {
  ruleId: string;
  /** Reuse only for the SAME physical device. Display names are never identities. */
  deviceId: string;
  name: string;
  category: HardwareCategory;
  unitPrice: number;
  quantityMode: 'ONE_PER_SYSTEM' | 'ONE_PER_N';
  unitsPerDevice?: number;
  phases?: HardwarePhase[];
};
export type ConfigurationHardware = {
  version: 1;
  inverterParallel?: HardwareRule;
  batteryConnection?: { ports: number; maxBatteries: number; expansion?: HardwareRule };
  batteryParallel?: HardwareRule;
};
export type HardwareProduct = {
  configurationHardware?: ConfigurationHardware | null;
  phase?: HardwarePhase | null;
  parallelSupported?: boolean;
  maxParallelUnits?: number | null;
  maxParallelModules?: number | null;
};
export type RequiredConfigurationComponent = {
  ruleId: string; deviceId: string; source: HardwareSource; category: HardwareCategory;
  name: string; quantity: number; unitPrice: number; totalPrice: number;
};
const integer = (v: unknown, min = 1): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
const categories: HardwareCategory[] = ['Parallel Device', 'Communication Device', 'Battery Junction Box', 'Battery Communication Device', 'Other'];
export function configurationHardwareErrors(config: unknown, product?: { category: string; parallelSupported: boolean; maxParallelUnits?: number | null; maxParallelModules?: number | null }): string[] {
  if (config == null) return [];
  const c = config as ConfigurationHardware;
  const errors: string[] = [];
  if (typeof c !== 'object' || Array.isArray(c) || c.version !== 1) return ['Unsupported hardware configuration version.'];
  for (const [source, rule] of Object.entries({ inverterParallel: c.inverterParallel, batteryParallel: c.batteryParallel, expansion: c.batteryConnection?.expansion })) {
    if (rule == null) continue;
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(rule.ruleId ?? '') || !/^[a-zA-Z0-9_-]{1,100}$/.test(rule.deviceId ?? '')) errors.push(`${source}: stable rule and device IDs are required (letters, numbers, hyphens, underscores).`);
    if (typeof rule.name !== 'string' || !rule.name.trim() || rule.name.length > 80) errors.push(`${source}: device name is required (maximum 80 characters).`);
    if (!categories.includes(rule.category)) errors.push(`${source}: choose a device category.`);
    if (typeof rule.unitPrice !== 'number' || !Number.isFinite(rule.unitPrice) || rule.unitPrice < 0 || rule.unitPrice > 100000000 || Math.abs(rule.unitPrice * 100 - Math.round(rule.unitPrice * 100)) > 0.00001) errors.push(`${source}: price must be non-negative PKR with at most two decimals.`);
    if (!['ONE_PER_SYSTEM', 'ONE_PER_N'].includes(rule.quantityMode)) errors.push(`${source}: choose a supported quantity mode.`);
    if (rule.quantityMode === 'ONE_PER_N' && !integer(rule.unitsPerDevice)) errors.push(`${source}: units per device must be a positive integer.`);
    if (source === 'inverterParallel' && (!Array.isArray(rule.phases) || !rule.phases.length || rule.phases.some(p => !['single', 'three'].includes(p)))) errors.push('Choose at least one parallel phase.');
  }
  if (c.batteryConnection) {
    const b = c.batteryConnection;
    if (!integer(b.ports, 0) || !integer(b.maxBatteries, 0) || b.maxBatteries < b.ports) errors.push('Battery maximum must be an integer at least equal to direct ports.');
    if (!b.expansion && b.maxBatteries !== b.ports) errors.push('Without expansion, maximum batteries must equal direct ports.');
    if (b.expansion && b.maxBatteries <= b.ports) errors.push('Expansion maximum must exceed direct ports.');
  }
  if (product) {
    if (product.category !== 'inverter' && (c.inverterParallel || c.batteryConnection)) errors.push('Inverter rules require an inverter product.');
    if (product.category !== 'battery' && c.batteryParallel) errors.push('Battery rules require a battery product.');
    if ((c.inverterParallel || c.batteryParallel) && !product.parallelSupported) errors.push('Enable parallel support before configuring parallel hardware.');
    if (c.inverterParallel && !integer(product.maxParallelUnits, 2)) errors.push('Parallel inverter maximum must be at least two.');
    if (c.batteryParallel && !integer(product.maxParallelModules, 2)) errors.push('Parallel battery maximum must be at least two.');
  }
  return errors;
}

export function resolveRequiredConfigurationComponents(input: {
  inverter?: HardwareProduct | null; inverterUnitCount: number; phaseConfiguration?: HardwarePhase | null;
  battery?: HardwareProduct | null; batteryUnitCount: number;
}): { valid: boolean; components: RequiredConfigurationComponent[]; total: number; errors: string[] } {
  const { inverter, battery, inverterUnitCount: iq, batteryUnitCount: bq } = input;
  const errors = [...configurationHardwareErrors(inverter?.configurationHardware), ...configurationHardwareErrors(battery?.configurationHardware)];
  const components: RequiredConfigurationComponent[] = [];
  if (!integer(iq, 0) || !integer(bq, 0)) errors.push('Hardware quantities must be whole non-negative numbers.');
  if (errors.length) return { valid: false, components, total: 0, errors };
  const ic = inverter?.configurationHardware, bc = battery?.configurationHardware;
  const add = (rule: HardwareRule | undefined, source: HardwareSource, count: number) => {
    if (!rule) return;
    const quantity = rule.quantityMode === 'ONE_PER_SYSTEM' ? 1 : Math.ceil(count / rule.unitsPerDevice!);
    const existing = components.find(c => c.deviceId === rule.deviceId);
    if (existing) {
      // Same device demands overlap. Highest count satisfies both; conflicting
      // catalog definitions fail closed instead of picking an arbitrary price.
      if (existing.unitPrice !== rule.unitPrice || existing.name !== rule.name || existing.category !== rule.category) errors.push(`Conflicting definitions for device ${rule.deviceId}. Ask Admin to align its name, category and price.`);
      existing.quantity = Math.max(existing.quantity, quantity);
      existing.totalPrice = Math.round(existing.quantity * existing.unitPrice * 100) / 100;
    } else components.push({ ruleId: rule.ruleId, deviceId: rule.deviceId, source, category: rule.category, name: rule.name.trim(), quantity, unitPrice: rule.unitPrice, totalPrice: Math.round(quantity * rule.unitPrice * 100) / 100 });
  };
  if (ic && iq > 1) {
    if (!inverter?.parallelSupported || iq > (inverter.maxParallelUnits ?? 1)) errors.push('Inverter count exceeds configured parallel support.');
    const phase = input.phaseConfiguration ?? inverter?.phase;
    if (ic.inverterParallel && !phase) errors.push('Select the inverter phase before resolving parallel hardware.');
    if (phase && ic.inverterParallel?.phases?.includes(phase)) add(ic.inverterParallel, 'inverter_parallel', iq);
  }
  if (ic?.batteryConnection && iq > 0) {
    const connection = ic.batteryConnection;
    if (bq > connection.maxBatteries) errors.push(`This inverter configuration supports at most ${connection.maxBatteries} batteries.`);
    if (bq > connection.ports) add(connection.expansion, 'battery_expansion', bq - connection.ports);
  }
  if (bc && bq > 1) {
    if (!battery?.parallelSupported || bq > (battery.maxParallelModules ?? 1)) errors.push('Battery count exceeds configured parallel support.');
    add(bc.batteryParallel, 'battery_parallel', bq);
  }
  return { valid: errors.length === 0, components, total: Math.round(components.reduce((sum, c) => sum + c.totalPrice, 0) * 100) / 100, errors };
}

/** Validate persisted lines without ever reading live rules or prices. */
export function validFrozenConfigurationComponents(value: unknown): value is RequiredConfigurationComponent[] {
  return Array.isArray(value) && value.length <= 3 && new Set(value.map(c => c?.deviceId)).size === value.length && value.every(c =>
    c && typeof c.ruleId === 'string' && typeof c.deviceId === 'string' && typeof c.name === 'string' && c.name.trim() &&
    categories.includes(c.category) && ['inverter_parallel', 'battery_expansion', 'battery_parallel'].includes(c.source) && integer(c.quantity) &&
    typeof c.unitPrice === 'number' && Number.isFinite(c.unitPrice) && c.unitPrice >= 0 && typeof c.totalPrice === 'number' && Number.isFinite(c.totalPrice) &&
    Math.abs(c.totalPrice - Math.round(c.quantity * c.unitPrice * 100) / 100) < 0.001);
}
