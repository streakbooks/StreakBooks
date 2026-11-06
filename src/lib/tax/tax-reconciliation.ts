/** Read-only filed-return variance, never a posted journal or statutory amendment. */
export type FiledReturnChange = {
  box_key: string;
  filed_minor: number;
  now_minor: number;
};

export function returnVariances(changes: readonly FiledReturnChange[]) {
  return changes.map((change) => {
    if (!Number.isSafeInteger(change.filed_minor) || !Number.isSafeInteger(change.now_minor)) {
      throw new Error("Filed return comparison contains an unsafe amount");
    }
    const deltaMinor = BigInt(change.now_minor) - BigInt(change.filed_minor);
    return { ...change, deltaMinor };
  });
}
