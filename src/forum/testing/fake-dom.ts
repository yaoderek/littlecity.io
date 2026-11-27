// Just enough of a page for the forum's unit tests (they run in Node, with no browser): elements with
// attributes, classes, text and children, events that bubble, and simple selectors (tag, .class, [attr],
// [attr="v"], descendants, and lists). Every innerHTML written is recorded, so a test can show that
// player text never went in that way. Tests only. Owner: Interface.

type Listener = (e: FakeEvent) => void;

export class FakeEvent {
  readonly type: string;
  target: FakeElement | null = null;
  readonly bubbles: boolean;
  readonly key: string;
  readonly shiftKey = false;
  readonly isComposing = false;
  stopped = false;
  defaultPrevented = false;
  constructor(type: string, init: { bubbles?: boolean; key?: string } = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? true;
    this.key = init.key ?? '';
  }
  stopPropagation(): void {
    this.stopped = true;
  }
  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

class FakeText {
  readonly nodeType = 3;
  parentNode: FakeElement | null = null;
  constructor(public data: string) {}
  get textContent(): string {
    return this.data;
  }
  remove(): void {
    this.parentNode?.removeChild(this);
  }
}

type Child = FakeElement | FakeText;

/** Every innerHTML written anywhere, in order. */
export const htmlWrites: string[] = [];

export class FakeElement {
  readonly nodeType = 1;
  readonly tagName: string;
  parentNode: FakeElement | null = null;
  childNodes: Child[] = [];
  private attrs = new Map<string, string>();
  private listeners = new Map<string, Listener[]>();
  private html = '';
  value = '';
  style: Record<string, string> = {};
  scrollTop = 0;
  clientHeight = 600;
  scrollHeight = 600;
  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }
  // ── attributes ──
  setAttribute(name: string, value: string): void {
    this.attrs.set(name, String(value));
    if (name === 'value') this.value = String(value);
  }
  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.attrs.has(name);
  }
  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }
  toggleAttribute(name: string, force?: boolean): boolean {
    const on = force ?? !this.attrs.has(name);
    if (on) this.attrs.set(name, '');
    else this.attrs.delete(name);
    return on;
  }
  get className(): string {
    return this.attrs.get('class') ?? '';
  }
  set className(v: string) {
    this.attrs.set('class', v);
  }
  get classList(): { add(...c: string[]): void; remove(...c: string[]): void; toggle(c: string, force?: boolean): boolean; contains(c: string): boolean } {
    const read = (): string[] => this.className.split(/\s+/).filter(Boolean);
    const write = (list: string[]): void => void (this.className = [...new Set(list)].join(' '));
    return {
      add: (...c) => write([...read(), ...c]),
      remove: (...c) => write(read().filter((x) => !c.includes(x))),
      toggle: (c, force) => {
        const on = force ?? !read().includes(c);
        write(on ? [...read(), c] : read().filter((x) => x !== c));
        return on;
      },
      contains: (c) => read().includes(c),
    };
  }
  get title(): string {
    return this.attrs.get('title') ?? '';
  }
  set title(v: string) {
    this.attrs.set('title', v);
  }
  get id(): string {
    return this.attrs.get('id') ?? '';
  }
  get disabled(): boolean {
    return this.attrs.has('disabled');
  }
  set disabled(v: boolean) {
    this.toggleAttribute('disabled', v);
  }
  get dataset(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of this.attrs) if (k.startsWith('data-')) out[k.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
    return out;
  }
  // ── content ──
  get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(v: string) {
    this.replaceChildren(v);
  }
  get innerHTML(): string {
    return this.html;
  }
  set innerHTML(v: string) {
    htmlWrites.push(v);
    this.childNodes = [];
    this.html = v;
  }
  get children(): FakeElement[] {
    return this.childNodes.filter((c): c is FakeElement => c instanceof FakeElement);
  }
  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }
  get lastElementChild(): FakeElement | null {
    return this.children.at(-1) ?? null;
  }
  get isConnected(): boolean {
    let n: FakeElement | null = this.parentNode;
    while (n) {
      if (n === fakeDocument.body) return true;
      n = n.parentNode;
    }
    return false;
  }
  private adopt(nodes: (Child | string)[]): Child[] {
    return nodes.map((n) => {
      const c = typeof n === 'string' ? new FakeText(n) : n;
      c.parentNode?.removeChild(c);
      c.parentNode = this;
      return c;
    });
  }
  append(...nodes: (Child | string)[]): void {
    this.childNodes.push(...this.adopt(nodes));
  }
  prepend(...nodes: (Child | string)[]): void {
    this.childNodes.unshift(...this.adopt(nodes));
  }
  replaceChildren(...nodes: (Child | string)[]): void {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    this.html = '';
    this.append(...nodes);
  }
  after(...nodes: (Child | string)[]): void {
    const p = this.parentNode;
    if (!p) return;
    const adopted = p.adopt(nodes);
    p.childNodes.splice(p.childNodes.indexOf(this) + 1, 0, ...adopted);
  }
  removeChild(c: Child): void {
    const i = this.childNodes.indexOf(c);
    if (i >= 0) this.childNodes.splice(i, 1);
    c.parentNode = null;
  }
  remove(): void {
    this.parentNode?.removeChild(this);
  }
  // ── events ──
  addEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn));
  }
  dispatchEvent(e: FakeEvent): boolean {
    e.target ??= this;
    let n: FakeElement | null = this as FakeElement;
    while (n) {
      for (const fn of n.listeners.get(e.type) ?? []) fn(e);
      if (!e.bubbles || e.stopped) break;
      n = n.parentNode;
    }
    return !e.defaultPrevented;
  }
  click(): void {
    if (this.disabled) return;
    this.dispatchEvent(new FakeEvent('click'));
  }
  focus(): void {}
  blur(): void {}
  scrollIntoView(): void {}
  // ── finding ──
  matches(selector: string): boolean {
    return selector.split(',').some((s) => matchChain(this, s.trim().split(/\s+/)));
  }
  closest(selector: string): FakeElement | null {
    let n: FakeElement | null = this as FakeElement;
    while (n) {
      if (n.matches(selector)) return n;
      n = n.parentNode;
    }
    return null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    const out: FakeElement[] = [];
    const walk = (e: FakeElement): void => {
      for (const c of e.children) {
        if (c.matches(selector)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

function matchOne(e: FakeElement, part: string): boolean {
  const re = /([a-zA-Z][\w-]*)|\.([\w-]+)|\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]|:not\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  let used = 0;
  while ((m = re.exec(part))) {
    used += m[0].length;
    if (m[1] && e.tagName !== m[1].toUpperCase()) return false;
    if (m[2] && !e.classList.contains(m[2])) return false;
    if (m[3] && (!e.hasAttribute(m[3]) || (m[4] !== undefined && e.getAttribute(m[3]) !== m[4]))) return false;
    if (m[5] && matchOne(e, m[5])) return false;
  }
  return used === part.length;
}

function matchChain(e: FakeElement, parts: string[]): boolean {
  const last = parts.at(-1);
  if (!last || !matchOne(e, last)) return false;
  if (parts.length === 1) return true;
  let n = e.parentNode;
  while (n) {
    if (matchChain(n, parts.slice(0, -1))) return true;
    n = n.parentNode;
  }
  return false;
}

export const fakeDocument = {
  body: new FakeElement('body'),
  createElement: (tag: string) => new FakeElement(tag),
  createTextNode: (text: string) => new FakeText(text),
  querySelector: (s: string) => fakeDocument.body.querySelector(s),
  querySelectorAll: (s: string) => fakeDocument.body.querySelectorAll(s),
};

/** Puts the fake page in place of `document` (call in beforeAll); returns a function that takes it away. */
export function installFakeDom(): () => void {
  const g = globalThis as { document?: unknown };
  const had = g.document;
  g.document = fakeDocument;
  return () => {
    g.document = had;
    fakeDocument.body.replaceChildren();
    htmlWrites.length = 0;
  };
}

/** Lets pending promises settle. */
export const settle = async (rounds = 5): Promise<void> => {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 0));
};

/** Every bit of text on the page under `root`, as a reader would see it. */
export const textOf = (root: FakeElement): string => root.textContent;
