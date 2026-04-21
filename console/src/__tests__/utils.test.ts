import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn()', () => {
  it('returns a single class name unchanged', () => {
    expect(cn('foo')).toBe('foo');
  });

  it('merges multiple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('drops falsy values', () => {
    expect(cn('foo', false, null, undefined, 'bar')).toBe('foo bar');
  });

  it('resolves tailwind conflicts — last wins', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('handles conditional classes via object syntax', () => {
    expect(cn({ 'text-green-500': true, 'text-red-500': false })).toBe('text-green-500');
  });

  it('returns empty string with no truthy args', () => {
    expect(cn(false, null, undefined)).toBe('');
  });

  it('handles array inputs', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });
});
