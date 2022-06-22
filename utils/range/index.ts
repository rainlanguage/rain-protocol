function* iterate(a, b) {
  for (let i = a; i <= b; i += 1) {
    yield i;
  }
}

export const range = (a, b): number[] => [...iterate(a, b)];
