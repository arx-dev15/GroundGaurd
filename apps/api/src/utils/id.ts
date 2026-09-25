import { v4 as uuidv4 } from 'uuid';

export type IDPrefix = 'usr' | 'proj' | 'doc' | 'chunk' | 'conv' | 'msg' | 'gen' | 'claim' | 'ev' | 'eval' | 'key' | 'req';;

/**
 * Generates a standardized prefixed UUID string.
 * Example: generateId('usr') -> 'usr_a1b2c3d4-e5f6-7890-abcd-ef1234567890'
 */
export function generateId(prefix: IDPrefix): string {
  return `${prefix}_${uuidv4()}`;
}
