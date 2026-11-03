/**
 * JSX declarations for RealScout's web components.
 *
 * The widgets are custom elements upgraded by RealScout's UMD bundle (see
 * `siteConfig.realscout.scriptSrc`). TypeScript has no way to know a tag with
 * a dash in it is legitimate, so without these declarations every
 * `<realscout-*>` element in the tree is an error: "Property
 * 'realscout-simple-search' does not exist on type 'JSX.IntrinsicElements'".
 *
 * The augmentation targets `react`'s own `JSX` namespace rather than the
 * global one. React 19 moved `JSX` under the `react` module and deprecated
 * `global.JSX`; with `jsx: "react-jsx"` the compiler resolves intrinsics
 * through `React.JSX.IntrinsicElements`, so a `declare global` block here
 * would typecheck against a namespace nothing reads.
 *
 * Attributes are declared in their hyphenated HTML form, which is also how
 * they must be written in JSX. React 19 passes an unknown attribute on a
 * custom element straight through to `setAttribute`, so the rendered DOM
 * carries exactly the attribute name spelled here — which is what the widget
 * bundle reads when it upgrades the element.
 *
 * `include-seller-listings` is a bare boolean attribute in the owner's HTML.
 * It is typed as `string` so it can be written `include-seller-listings=""`:
 * the empty string renders as a valueless attribute, matching the supplied
 * markup. `{true}` would render the literal text `true`, which is a different
 * attribute value and could change which listings come back.
 */

import type * as React from 'react';

/** Attributes shared by every RealScout element: the account it renders for. */
interface RealScoutElementAttributes extends React.HTMLAttributes<HTMLElement> {
  'agent-encoded-id': string;
}

/** `realscout-your-listings` — the only widget that renders properties. */
interface RealScoutYourListingsAttributes extends RealScoutElementAttributes {
  'sort-order'?: string;
  'listing-status'?: string;
  'property-types'?: string;
  /** Bare boolean attribute. Pass `""`, never `{true}`. */
  'include-seller-listings'?: string;
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'realscout-simple-search': RealScoutElementAttributes;
      'realscout-advanced-search': RealScoutElementAttributes;
      'realscout-your-listings': RealScoutYourListingsAttributes;
      'realscout-home-value': RealScoutElementAttributes;
    }
  }
}
