// Bounded head + tail retention of a child's output. Test and build summaries
// (TAP `not ok` blocks, compiler error totals) sit at the END of long output, so
// keeping only the first bytes loses the evidence that matters most.
export const truncationMarker = bytes => `\n…[kesildi: ${bytes} bayt]…\n`;

export function createOutputRetainer(maxBytes) {
  const headLimit = Math.ceil(maxBytes / 2);
  const tailLimit = maxBytes - headLimit;
  const head = [];
  let tail = [], headBytes = 0, tailBytes = 0, total = 0;
  return {
    push(bytes) {
      total += bytes.length;
      let rest = bytes;
      if (headBytes < headLimit) {
        const take = rest.subarray(0, headLimit - headBytes);
        head.push(take); headBytes += take.length; rest = rest.subarray(take.length);
      }
      if (!rest.length || !tailLimit) return;
      tail.push(rest); tailBytes += rest.length;
      while (tailBytes > tailLimit) {
        const excess = tailBytes - tailLimit;
        if (tail[0].length <= excess) { tailBytes -= tail[0].length; tail.shift(); }
        else { tail[0] = tail[0].subarray(excess); tailBytes -= excess; }
      }
    },
    // The marker is added outside the byte budget so retained evidence stays exactly maxBytes.
    text() {
      const dropped = total - headBytes - tailBytes;
      return `${Buffer.concat(head).toString()}${dropped > 0 ? truncationMarker(dropped) : ''}${Buffer.concat(tail).toString()}`;
    },
    get truncated() { return total > maxBytes; },
  };
}
