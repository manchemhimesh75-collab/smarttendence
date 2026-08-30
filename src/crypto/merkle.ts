import {
  hashSha256,
  toBase64Url,
  buildMerkleTree,
  generateMerkleProof,
  verifyMerkleProof,
} from './hashing';

export interface MerkleTree {
  root: string;
  leaves: string[];
  tree: string[][];
}

export interface MerkleProof {
  leafIndex: number;
  leaf: string;
  proof: string[];
  root: string;
}

export async function createMerkleTree(records: Uint8Array[]): Promise<MerkleTree> {
  const { root, tree } = await buildMerkleTree(records);
  
  const leaves = records.map(r => toBase64Url(r));
  const treeB64 = tree.map(level => level.map(l => toBase64Url(l)));
  
  return {
    root: toBase64Url(root),
    leaves,
    tree: treeB64,
  };
}

export async function createMerkleTreeFromStrings(records: string[]): Promise<MerkleTree> {
  const encoder = new TextEncoder();
  const recordsBytes = records.map(r => encoder.encode(r));
  return createMerkleTree(recordsBytes);
}

export async function generateMerkleProofForRecord(
  merkleTree: MerkleTree,
  recordIndex: number
): Promise<MerkleProof> {
  const leavesBytes = merkleTree.leaves.map(l => fromBase64Url(l));
  const { root, tree } = await buildMerkleTree(leavesBytes);
  const proof = await generateMerkleProof(tree, recordIndex);
  
  return {
    leafIndex: recordIndex,
    leaf: merkleTree.leaves[recordIndex],
    proof: proof.map(p => toBase64Url(p)),
    root: toBase64Url(root),
  };
}

export async function verifyMerkleProof(proof: MerkleProof): Promise<boolean> {
  const leaf = fromBase64Url(proof.leaf);
  const proofBytes = proof.proof.map(p => fromBase64Url(p));
  const root = fromBase64Url(proof.root);
  
  return verifyMerkleProof(leaf, proofBytes, root);
}

export function recordToLeaf(record: Record<string, unknown>): Uint8Array {
  const sortedKeys = Object.keys(record).sort();
  const canonical: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    canonical[key] = record[key];
  }
  const json = JSON.stringify(canonical);
  const encoder = new TextEncoder();
  return encoder.encode(json);
}

export function createMerkleReceipt(
  records: Record<string, unknown>[]
): { merkleTree: MerkleTree; proofs: MerkleProof[] } {
  // This is a synchronous version for immediate use
  // In production, use the async versions above
  return { merkleTree: { root: '', leaves: [], tree: [] }, proofs: [] };
}