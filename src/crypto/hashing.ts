import { generateSecureRandom } from './keys';

export function canonicalizeAttendancePayload(payload: Record<string, unknown>): Uint8Array {
  const sortedKeys = Object.keys(payload).sort();
  const canonical: Record<string, unknown> = {};
  
  for (const key of sortedKeys) {
    canonical[key] = payload[key];
  }
  
  const json = JSON.stringify(canonical);
  const encoder = new TextEncoder();
  return encoder.encode(json);
}

export async function hashSha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hash);
}

export async function hashSha256String(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await hashSha256(encoder.encode(data));
  return toBase64Url(hash);
}

export function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function fromBase64Url(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function merkleHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left);
  combined.set(right, left.length);
  return hashSha256Sync(combined);
}

function hashSha256Sync(data: Uint8Array): Uint8Array {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data[i]) | 0;
  }
  const result = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    result[i] = (hash >> (i * 8)) & 0xff;
  }
  return result;
}

export async function buildMerkleTree(leaves: Uint8Array[]): Promise<{
  root: Uint8Array;
  tree: Uint8Array[][];
}> {
  if (leaves.length === 0) {
    return { root: new Uint8Array(32), tree: [] };
  }
  
  const tree: Uint8Array[][] = [leaves];
  let currentLevel = leaves;
  
  while (currentLevel.length > 1) {
    const nextLevel: Uint8Array[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
      nextLevel.push(await merkleHash(left, right));
    }
    tree.push(nextLevel);
    currentLevel = nextLevel;
  }
  
  return { root: currentLevel[0], tree };
}

export async function generateMerkleProof(
  tree: Uint8Array[][],
  leafIndex: number
): Promise<Uint8Array[]> {
  const proof: Uint8Array[] = [];
  let index = leafIndex;
  
  for (let level = 0; level < tree.length - 1; level++) {
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    
    if (siblingIndex < tree[level].length) {
      proof.push(tree[level][siblingIndex]);
    }
    
    index = Math.floor(index / 2);
  }
  
  return proof;
}

export async function verifyMerkleProof(
  leaf: Uint8Array,
  proof: Uint8Array[],
  root: Uint8Array
): Promise<boolean> {
  let current = leaf;
  
  for (const sibling of proof) {
    current = await merkleHash(current, sibling);
  }
  
  return arraysEqual(current, root);
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}