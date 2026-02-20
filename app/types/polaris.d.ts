// Local stub for Polaris web component types.
// The @shopify/polaris-types npm package (1.0.3) is missing its dist directory,
// so we declare the custom elements here to satisfy TypeScript.

declare namespace React.JSX {
  interface IntrinsicElements {
    [key: `s-${string}`]: React.HTMLAttributes<HTMLElement> &
      Record<string, unknown>;
  }
}
