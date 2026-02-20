// Polaris web component type overrides.
// Fixes two issues with @shopify/app-bridge-types v1.x:
//
// 1. SPageAttributes.children is typed as the unexported SPageChildren interface
//    which only allows { primaryAction?, secondaryActions?, breadcrumbActions? }.
//    We intercept s-page in the global JSX namespace and set children?: any so
//    that the merged type (SPageChildren & any = any) allows arbitrary children.
//
// 2. The previous index signature extended React.HTMLAttributes<HTMLElement>,
//    which carries onChange?: FormEventHandler<HTMLElement>. Polaris web components
//    dispatch native DOM Events, not React SyntheticEvents, so onChange and onClick
//    are declared as (event: Event) => void.

export {}; // module file — enables `declare module` augmentation below

declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Override s-page so children? intersects with `any`, collapsing the strict
      // SPageChildren to `any` and allowing multiple arbitrary React children.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "s-page": { children?: any; heading?: string; slot?: string; [key: string]: unknown };

      // Generic index signature for all other s-* Polaris components.
      // Uses native DOM Event (not React FormEventHandler) for onChange/onClick.
      [key: `s-${string}`]: {
        children?: React.ReactNode;
        slot?: string;
        onChange?: (event: Event) => void;
        onClick?: (event: Event) => void;
        heading?: string;
        tone?: string;
        variant?: string;
        type?: string;
        label?: string;
        value?: string | number;
        min?: number;
        max?: number;
        step?: number;
        disabled?: boolean;
        loading?: boolean;
        size?: string;
        href?: string;
        target?: string;
        padding?: string;
        gap?: string;
        border?: string;
        borderRadius?: string;
        background?: string;
        direction?: string;
        details?: string;
        name?: string;
        autocomplete?: string;
        error?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref?: any;
        style?: React.CSSProperties;
        className?: string;
        id?: string;
        key?: React.Key;
        [key: string]: unknown;
      };
    }
  }
}
