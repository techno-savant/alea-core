import { describe, it, expect, vi, afterEach } from 'vitest';
import { MechanicRegistry } from '../../../src/registry/MechanicRegistry.js';
import { makeMockMechanic } from '../../helpers/fixtures.js';

// The registry is a singleton — state persists across all tests in this file.
// Every test uses a unique id to avoid cross-test interference.
let counter = 0;
function uniqueId(): string {
  return `test-mechanic-${++counter}`;
}

describe('MechanicRegistry', () => {
  describe('register', () => {
    it('should store a mechanic and make it retrievable by id', () => {
      const id = uniqueId();
      const mechanic = makeMockMechanic(id);

      MechanicRegistry.register(mechanic);

      expect(MechanicRegistry.get(id)).toBe(mechanic);
    });

    it('should warn via console.warn when replacing an existing mechanic', () => {
      const id = uniqueId();
      const first = makeMockMechanic(id);
      const second = makeMockMechanic(id);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      MechanicRegistry.register(first);
      MechanicRegistry.register(second);

      expect(warnSpy).toHaveBeenCalledOnce();
      warnSpy.mockRestore();
    });

    it('should replace the mechanic when the same id is registered twice', () => {
      const id = uniqueId();
      const first = makeMockMechanic(id);
      const second = makeMockMechanic(id);
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      MechanicRegistry.register(first);
      MechanicRegistry.register(second);

      expect(MechanicRegistry.get(id)).toBe(second);
      vi.restoreAllMocks();
    });

    it('should not warn when registering a mechanic for the first time', () => {
      const id = uniqueId();
      const mechanic = makeMockMechanic(id);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      MechanicRegistry.register(mechanic);

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('get', () => {
    it('should return undefined for an unregistered id', () => {
      const id = uniqueId();

      const result = MechanicRegistry.get(id);

      expect(result).toBeUndefined();
    });

    it('should return the registered mechanic', () => {
      const id = uniqueId();
      const mechanic = makeMockMechanic(id);

      MechanicRegistry.register(mechanic);
      const result = MechanicRegistry.get(id);

      expect(result).toBe(mechanic);
    });
  });

  describe('has', () => {
    it('should return true for a registered id', () => {
      const id = uniqueId();
      const mechanic = makeMockMechanic(id);

      MechanicRegistry.register(mechanic);

      expect(MechanicRegistry.has(id)).toBe(true);
    });

    it('should return false for an unregistered id', () => {
      const id = uniqueId();

      expect(MechanicRegistry.has(id)).toBe(false);
    });
  });

  describe('all', () => {
    it('should include all registered mechanics', () => {
      const idA = uniqueId();
      const idB = uniqueId();
      const mechanicA = makeMockMechanic(idA);
      const mechanicB = makeMockMechanic(idB);

      MechanicRegistry.register(mechanicA);
      MechanicRegistry.register(mechanicB);

      const map = MechanicRegistry.all();

      expect(map.get(idA)).toBe(mechanicA);
      expect(map.get(idB)).toBe(mechanicB);
    });

    it('should return a ReadonlyMap', () => {
      const map = MechanicRegistry.all();

      expect(map).toBeInstanceOf(Map);
    });
  });
});
