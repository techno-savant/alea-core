import { describe, it, expect } from 'vitest';
import { TierLabelRegistry } from '../../../src/registry/TierLabelRegistry.js';
import type { ResultTier, TierLabelKey } from '../../../src/types/index.js';

// TierLabelRegistry is a singleton backed by a plain object — labels accumulate
// across all tests in this file. To prevent cross-test interference every test
// uses composite keys that are unique to that test, avoiding collisions with the
// limited ResultTier union members used by other tests.

describe('TierLabelRegistry', () => {

  // ─── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    it('should store and retrieve a bare tier label', () => {
      const labels: Partial<Record<TierLabelKey, string>> = { 'strong-hit': 'Critical Success' };

      TierLabelRegistry.register(labels);

      expect(TierLabelRegistry.resolve('strong-hit')).toBe('Critical Success');
    });

    it('should merge new labels — later registration wins on collision', () => {
      // Register an initial value then overwrite it with a second call.
      TierLabelRegistry.register({ hit: 'First Hit Label' });

      TierLabelRegistry.register({ hit: 'Second Hit Label' });

      expect(TierLabelRegistry.resolve('hit')).toBe('Second Hit Label');
    });

    it('should keep previously registered keys that are not in the new batch', () => {
      TierLabelRegistry.register({ 'close-hit': 'Partial Strike' });

      // Registering an unrelated key must not remove 'close-hit'.
      TierLabelRegistry.register({ glancing: 'Near Miss' });

      expect(TierLabelRegistry.resolve('close-hit')).toBe('Partial Strike');
    });

    it('should accept composite keys in the same registration call', () => {
      const labels: Partial<Record<TierLabelKey, string>> = {
        miss: 'Failure',
        'miss+glitch': 'Catastrophic Failure',
        'miss+critical': 'Critical Failure',
      };

      TierLabelRegistry.register(labels);

      expect(TierLabelRegistry.resolve('miss+glitch')).toBe('Catastrophic Failure');
      expect(TierLabelRegistry.resolve('miss+critical')).toBe('Critical Failure');
    });
  });

  // ─── resolve ───────────────────────────────────────────────────────────────

  describe('resolve', () => {
    it('should return undefined for an unregistered key', () => {
      // 'glancing+critical' is very unlikely to have been set by any other test.
      const result = TierLabelRegistry.resolve('glancing+critical' as TierLabelKey);

      expect(result).toBeUndefined();
    });

    it('should return the registered label for a bare tier key', () => {
      TierLabelRegistry.register({ glancing: 'Glancing Blow' });

      const result = TierLabelRegistry.resolve('glancing');

      expect(result).toBe('Glancing Blow');
    });

    it('should return the registered label for a composite glitch key', () => {
      TierLabelRegistry.register({ 'strong-hit+glitch': 'Wild Success' });

      const result = TierLabelRegistry.resolve('strong-hit+glitch');

      expect(result).toBe('Wild Success');
    });

    it('should return the registered label for a composite critical key', () => {
      TierLabelRegistry.register({ 'close-hit+critical': 'Desperate Strike' });

      const result = TierLabelRegistry.resolve('close-hit+critical');

      expect(result).toBe('Desperate Strike');
    });
  });

  // ─── resolveWithFallback ───────────────────────────────────────────────────

  describe('resolveWithFallback', () => {
    it('should return the composite glitch label when glitch flag is true and composite is registered', () => {
      const tier: ResultTier = 'hit';
      TierLabelRegistry.register({ 'hit+glitch': 'Glitched Hit' });

      const result = TierLabelRegistry.resolveWithFallback(tier, { glitch: true });

      expect(result).toBe('Glitched Hit');
    });

    it('should return the composite critical label when critical flag is true and composite is registered', () => {
      const tier: ResultTier = 'hit';
      TierLabelRegistry.register({ 'hit+critical': 'Critical Hit' });

      const result = TierLabelRegistry.resolveWithFallback(tier, { critical: true });

      expect(result).toBe('Critical Hit');
    });

    it('should fall back to the bare tier label when the glitch composite is not registered', () => {
      // Use 'glancing' — 'glancing+glitch' is never registered anywhere in this file.
      TierLabelRegistry.register({ glancing: 'Glancing Blow' });

      const result = TierLabelRegistry.resolveWithFallback('glancing', { glitch: true });

      expect(result).toBe('Glancing Blow');
    });

    it('should fall back to the bare tier label when the critical composite is not registered', () => {
      // 'glancing' bare label is set; the critical composite is intentionally absent.
      TierLabelRegistry.register({ glancing: 'Glancing Blow' });
      // Deliberately do NOT register 'glancing+critical'.

      const result = TierLabelRegistry.resolveWithFallback('glancing', { critical: true });

      expect(result).toBe('Glancing Blow');
    });

    it('should fall back to the tier string itself when no label is registered at all', () => {
      // Cast a string that is not in the ResultTier union and has never been
      // registered — the registry must echo the key back unchanged.
      const unregisteredTier = 'no-such-tier' as unknown as ResultTier;

      const result = TierLabelRegistry.resolveWithFallback(unregisteredTier, {});

      expect(result).toBe('no-such-tier');
    });

    it('should prefer the glitch composite over the critical composite when both flags are true', () => {
      const tier: ResultTier = 'miss';
      // Both composites are registered; glitch must win because it is the first `if` branch.
      TierLabelRegistry.register({
        'miss+glitch': 'Glitched Miss',
        'miss+critical': 'Critical Miss',
      });

      const result = TierLabelRegistry.resolveWithFallback(tier, { glitch: true, critical: true });

      expect(result).toBe('Glitched Miss');
    });

    it('should return the bare tier label when no flags are set', () => {
      const tier: ResultTier = 'hit';
      TierLabelRegistry.register({ hit: 'Standard Hit' });

      const result = TierLabelRegistry.resolveWithFallback(tier, {});

      expect(result).toBe('Standard Hit');
    });

    it('should return the tier string itself when flags are empty and no label is registered', () => {
      // Cast a string that is not a real ResultTier to guarantee it has no
      // registered entry — simulates a consumer passing an unexpected tier value.
      const unknownTier = 'unknown-tier' as unknown as ResultTier;

      const result = TierLabelRegistry.resolveWithFallback(unknownTier, {});

      expect(result).toBe('unknown-tier');
    });

    it('should ignore the glitch composite and fall through to bare when glitch flag is false', () => {
      const tier: ResultTier = 'hit';
      TierLabelRegistry.register({ 'hit+glitch': 'Glitched Hit', hit: 'Normal Hit' });

      const result = TierLabelRegistry.resolveWithFallback(tier, { glitch: false });

      expect(result).toBe('Normal Hit');
    });

    it('should ignore the critical composite and fall through to bare when critical flag is false', () => {
      const tier: ResultTier = 'hit';
      TierLabelRegistry.register({ 'hit+critical': 'Critical Hit', hit: 'Normal Hit' });

      const result = TierLabelRegistry.resolveWithFallback(tier, { critical: false });

      expect(result).toBe('Normal Hit');
    });
  });
});
