import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { GET_BUNDLE_PRODUCTS } from "../graphql/queries/getBundles";

// ---------------------------------------------------------------------------
// Loader — quick stats
// ---------------------------------------------------------------------------

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(GET_BUNDLE_PRODUCTS, {
    variables: { query: "" },
  });
  const data = (await response.json()) as {
    data?: {
      products?: {
        edges: Array<{
          node: {
            variants: {
              edges: Array<{
                node: {
                  bundleType?: { value: string } | null;
                };
              }>;
            };
          };
        }>;
      };
    };
  };

  let expandCount = 0;
  let mergeCount = 0;
  let updateCount = 0;

  for (const edge of data.data?.products?.edges ?? []) {
    for (const variantEdge of edge.node.variants?.edges ?? []) {
      const type = variantEdge.node.bundleType?.value;
      if (type === "expand") expandCount++;
      else if (type === "merge") mergeCount++;
      else if (type === "update") updateCount++;
    }
  }

  const totalBundles = expandCount + mergeCount + updateCount;

  return { totalBundles, expandCount, mergeCount, updateCount };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Index() {
  const { totalBundles, expandCount, mergeCount, updateCount } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Bundle Transform App">
      {/* ── What this app does ─────────────────────────────────────────── */}
      <s-section heading="How it works">
        <s-paragraph>
          This app lets you configure Shopify Functions that automatically
          transform cart lines at checkout. Three transform types are supported:
        </s-paragraph>
        <s-stack direction="block" gap="small-200">
          <s-stack direction="inline" gap="small-200">
            <s-badge tone="info">expand</s-badge>
            <s-text>
              Split a single bundle product into its component items — great for
              gift sets or kits.
            </s-text>
          </s-stack>
          <s-stack direction="inline" gap="small-200">
            <s-badge tone="success">merge</s-badge>
            <s-text>
              Combine separate cart lines into one bundle line — useful for
              mix-and-match bundles.
            </s-text>
          </s-stack>
          <s-stack direction="inline" gap="small-200">
            <s-badge tone="warning">update</s-badge>
            <s-text>
              Override the title or price of a cart line — useful for
              subscription or loyalty pricing.
            </s-text>
          </s-stack>
        </s-stack>
      </s-section>

      {/* ── Quick stats ────────────────────────────────────────────────── */}
      <s-section heading="Bundle overview">
        {totalBundles === 0 ? (
          <s-paragraph>
            No bundles configured yet.{" "}
            <s-link href="/app/bundles">Create your first bundle</s-link> to
            get started.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            <s-paragraph>
              <s-text type="strong">{totalBundles}</s-text> bundle
              {totalBundles !== 1 ? "s" : ""} configured across your product
              catalog.
            </s-paragraph>
            <s-stack direction="inline" gap="base">
              <s-box
                padding="base"
                border="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="small-100">
                  <s-text type="strong">{expandCount}</s-text>
                  <s-badge tone="info">expand</s-badge>
                </s-stack>
              </s-box>
              <s-box
                padding="base"
                border="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="small-100">
                  <s-text type="strong">{mergeCount}</s-text>
                  <s-badge tone="success">merge</s-badge>
                </s-stack>
              </s-box>
              <s-box
                padding="base"
                border="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="small-100">
                  <s-text type="strong">{updateCount}</s-text>
                  <s-badge tone="warning">update</s-badge>
                </s-stack>
              </s-box>
            </s-stack>
          </s-stack>
        )}
      </s-section>

      {/* ── Quick links (aside) ────────────────────────────────────────── */}
      <s-section slot="aside" heading="Get started">
        <s-stack direction="block" gap="base">
          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text type="strong">Configure Bundles</s-text>
              <s-paragraph>
                Create and manage bundle configurations for your product
                variants.
              </s-paragraph>
              <s-button href="/app/bundles" variant="secondary">
                Go to Bundles
              </s-button>
            </s-stack>
          </s-box>
          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-text type="strong">Test Dashboard</s-text>
              <s-paragraph>
                Simulate the cart transform function without going through
                checkout. See exactly what operations will be applied.
              </s-paragraph>
              <s-button href="/app/test" variant="secondary">
                Open Test Dashboard
              </s-button>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Resources">
        <s-unordered-list>
          <s-list-item>
            <s-link
              href="https://shopify.dev/docs/apps/build/functions/input-output/cart-transform"
              target="_blank"
            >
              Cart Transform Function docs
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link
              href="https://shopify.dev/docs/api/functions/reference/cart-transform"
              target="_blank"
            >
              Function API reference
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link
              href="https://shopify.dev/docs/apps/selling-strategies/bundles"
              target="_blank"
            >
              Bundles developer guide
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
