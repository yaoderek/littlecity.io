import { describe, expect, it } from 'vitest';
import { packOutputs } from './packed';
import { paperFragment, skyFragment } from './shaders/composite';
import { surfaceFragment } from './shaders/surface';

describe('packOutputs', () => {
  it('turns each of the town\'s shaders into one that writes a single packed target', () => {
    for (const src of [surfaceFragment, paperFragment, skyFragment]) {
      const out = packOutputs(src);
      expect(out).toContain('layout(location = 0) out highp uvec4 oPacked;');
      expect(out).not.toContain('layout(location = 1)');
      expect(out.split('void main(){')).toHaveLength(2);
      expect(out).toContain('void lcMain(){');
      // Nothing else of the shader is touched.
      expect(out.length - src.length).toBeLessThan(260);
    }
  });
  it('refuses a shader that is not one of them', () => {
    expect(() => packOutputs('void main(){}')).toThrow();
  });
});
