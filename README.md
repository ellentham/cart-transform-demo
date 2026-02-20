# Cart Transform Bundle Testing App

A Shopify app for testing and previewing cart transform function bundles.

## Features
- Configure product bundles with expand, merge, and update operations
- Visual cart transform simulator — see before/after cart state
- Pre-built test fixtures for quick testing
- Admin UI built with Polaris

## Setup
1. Clone the repo
2. Run `npm install`
3. Run `shopify app dev` to start development
4. Install on a development store

## Architecture
- **App**: React Router + Polaris embedded app
- **Function**: TypeScript cart transform function (extensions/bundle-transform/)
- **Data**: Bundle config stored as variant metafields in namespace `$app:bundle`

## Cart Transform Operations
- **Expand**: Break a parent bundle into component line items
- **Merge**: Combine multiple lines into a single bundle line
- **Update**: Override line item presentation (title, price, image)

## Development
- `shopify app dev` — start dev server
- `shopify app function build` — build the function (in extensions/bundle-transform/)
- `shopify app function run --input=<file>` — test function locally
