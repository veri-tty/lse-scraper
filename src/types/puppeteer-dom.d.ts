// Type declarations for puppeteer page.evaluate context
// These types are needed because code in page.evaluate() runs in browser context

declare global {
  interface Document {
    querySelector(selectors: string): Element | null;
    querySelectorAll(selectors: string): NodeListOf<Element>;
    documentElement: HTMLElement;
  }

  interface Element {
    textContent: string | null;
    getAttribute(name: string): string | null;
    outerHTML: string;
  }

  interface HTMLElement extends Element {
    outerHTML: string;
  }

  interface HTMLAnchorElement extends HTMLElement {
    href: string;
  }
}

export {};
