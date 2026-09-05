import { describe, it, expect } from 'vitest';
import { getProvenanceConfig, getProvenanceBadgeHtml } from './ProvenanceBadge';

describe('ProvenanceBadge helpers', () => {
  it('maps REAL and CALIBRATED to LIVE with green colors', () => {
    const realCfg = getProvenanceConfig('REAL');
    expect(realCfg.label).toBe('LIVE');
    expect(realCfg.text).toBe('#10B981');
    expect(realCfg.cssClass).toBe('provenance-live');

    const calibCfg = getProvenanceConfig('CALIBRATED');
    expect(calibCfg.label).toBe('LIVE');
    expect(calibCfg.text).toBe('#10B981');
  });

  it('maps REPLAYED and DERIVED to REPLAY with grey colors', () => {
    const replayCfg = getProvenanceConfig('REPLAYED');
    expect(replayCfg.label).toBe('REPLAY');
    expect(replayCfg.text).toBe('#94A3B8');
    expect(replayCfg.cssClass).toBe('provenance-replay');

    const derivedCfg = getProvenanceConfig('DERIVED');
    expect(derivedCfg.label).toBe('REPLAY');
    expect(derivedCfg.text).toBe('#94A3B8');
  });

  it('maps SIMULATED, MOCK, and undefined to SIM with amber colors', () => {
    const simCfg = getProvenanceConfig('SIMULATED');
    expect(simCfg.label).toBe('SIM');
    expect(simCfg.text).toBe('#F59E0B');
    expect(simCfg.cssClass).toBe('provenance-sim');

    const mockCfg = getProvenanceConfig('MOCK');
    expect(mockCfg.label).toBe('SIM');

    const undefCfg = getProvenanceConfig(undefined);
    expect(undefCfg.label).toBe('SIM');
  });

  it('generates valid HTML string with appropriate sizes', () => {
    const htmlXs = getProvenanceBadgeHtml('REAL', 'xs');
    expect(htmlXs).toContain('LIVE');
    expect(htmlXs).toContain('provenance-live');
    expect(htmlXs).toContain('#10B981');

    const htmlSm = getProvenanceBadgeHtml('REPLAYED', 'sm');
    expect(htmlSm).toContain('REPLAY');
    expect(htmlSm).toContain('provenance-replay');

    const htmlMd = getProvenanceBadgeHtml('SIMULATED', 'md');
    expect(htmlMd).toContain('SIM');
    expect(htmlMd).toContain('provenance-sim');
  });
});
