export class Heap {
  constructor(before) {
    this.before = before;
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  push(value) {
    const a = this.items;
    let i = a.length;
    a.push(value);
    while (i) {
      const p = Math.floor((i - 1) / 2);
      if (!this.before(value, a[p])) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = value;
  }
  pop() {
    const a = this.items,
      top = a[0],
      item = a.pop();
    if (!a.length) return top;
    let i = 0;
    while (i * 2 + 1 < a.length) {
      let child = i * 2 + 1;
      if (child + 1 < a.length && this.before(a[child + 1], a[child])) child++;
      if (!this.before(a[child], item)) break;
      a[i] = a[child];
      i = child;
    }
    a[i] = item;
    return top;
  }
}
