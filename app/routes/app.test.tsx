import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { GET_BUNDLE_PRODUCTS } from "../graphql/queries/getBundles";
import {
  simulateCartTransform,
  type SimCartLine,
  type SimTransformResult,
} from "../utils/simulate-transform";
import { buildFunctionInput, type FunctionInput } from "../utils/build-function-input";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExpandComponent = {
  variantId: string;
  variantLabel: string;
  quantity: number;
  price: string;
};

type BundleRecord = {
  variantId: string;
  variantTitle: string;
  productTitle: string;
  bundleType: "expand" | "merge" | "update";
  components: ExpandComponent[];
  mergeGroupName?: string;
  titleOverride?: string;
  priceOverride?: string;
};

// ---------------------------------------------------------------------------
// Loader (same bundle query as the bundles page)
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
            id: string;
            title: string;
            variants: {
              edges: Array<{
                node: {
                  id: string;
                  title: string;
                  price: string;
                  bundleComponents?: { value: string } | null;
                  bundleType?: { value: string } | null;
                };
              }>;
            };
          };
        }>;
      };
    };
  };

  const bundles: BundleRecord[] = [];

  for (const edge of data.data?.products?.edges ?? []) {
    const product = edge.node;
    for (const variantEdge of product.variants?.edges ?? []) {
      const variant = variantEdge.node;
      if (!variant.bundleType?.value) continue;

      const type = variant.bundleType.value as "expand" | "merge" | "update";
      let raw: unknown = null;
      try {
        raw = variant.bundleComponents?.value
          ? JSON.parse(variant.bundleComponents.value)
          : null;
      } catch {
        /* ignore parse errors */
      }

      const record: BundleRecord = {
        variantId: variant.id,
        variantTitle: variant.title,
        productTitle: product.title,
        bundleType: type,
        components: [],
      };

      if (type === "expand" && Array.isArray(raw)) {
        record.components = raw as ExpandComponent[];
      } else if (type === "merge" && raw && typeof raw === "object") {
        const cfg = raw as { groupName?: string };
        record.mergeGroupName = cfg.groupName ?? "";
      } else if (type === "update" && raw && typeof raw === "object") {
        const cfg = raw as {
          titleOverride?: string;
          priceOverride?: string;
        };
        record.titleOverride = cfg.titleOverride;
        record.priceOverride = cfg.priceOverride;
      }

      bundles.push(record);
    }
  }

  return { bundles };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bundleTypeTone(
  type: string
): "info" | "success" | "warning" | "neutral" {
  switch (type) {
    case "expand":
      return "info";
    case "merge":
      return "success";
    case "update":
      return "warning";
    default:
      return "neutral";
  }
}

function tagTone(
  tag: "expanded" | "merged" | "updated" | "unchanged"
): "info" | "success" | "warning" | "neutral" {
  switch (tag) {
    case "expanded":
      return "info";
    case "merged":
      return "success";
    case "updated":
      return "warning";
    default:
      return "neutral";
  }
}

let lineCounter = 0;
function nextLineId() {
  return `line-${++lineCounter}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TestDashboard() {
  const { bundles } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();

  // ── Cart simulator state ──────────────────────────────────────────────────
  const [cartLines, setCartLines] = useState<SimCartLine[]>([]);
  const [simResult, setSimResult] = useState<{
    functionInput: FunctionInput;
    transform: SimTransformResult;
  } | null>(null);
  const [showInputJson, setShowInputJson] = useState(false);
  const [showOutputJson, setShowOutputJson] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  // ── Cart line helpers ─────────────────────────────────────────────────────

  const addVariantsToCart = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selected = await (shopify as any).resourcePicker({
      type: "variant",
      multiple: true,
    });
    if (!selected?.length) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newLines: SimCartLine[] = (selected as any[]).map((v) => {
      const variantId = v.id as string;
      const bundle = bundles.find((b) => b.variantId === variantId);
      return {
        id: nextLineId(),
        variantId,
        variantTitle: (v.title as string) ?? "Default Title",
        productTitle: (v.product?.title as string) ?? "Unknown Product",
        quantity: 1,
        price: (v.price as string) ?? "0.00",
        attributes: [],
        bundleType: bundle?.bundleType,
        bundleComponents: bundle?.components,
        titleOverride: bundle?.titleOverride,
        priceOverride: bundle?.priceOverride,
      };
    });

    setCartLines((prev) => [...prev, ...newLines]);
    setSimResult(null);
  };

  const removeLine = (idx: number) => {
    setCartLines((prev) => prev.filter((_, i) => i !== idx));
    setSimResult(null);
  };

  const updateLineQuantity = (idx: number, val: string) => {
    const qty = parseInt(val, 10);
    if (isNaN(qty) || qty < 1) return;
    setCartLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, quantity: qty } : l))
    );
    setSimResult(null);
  };

  const updateLinePrice = (idx: number, val: string) => {
    setCartLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, price: val } : l))
    );
    setSimResult(null);
  };

  const addAttr = (lineIdx: number) => {
    setCartLines((prev) =>
      prev.map((l, i) =>
        i === lineIdx
          ? { ...l, attributes: [...l.attributes, { key: "", value: "" }] }
          : l
      )
    );
  };

  const addBundleGroupAttr = (lineIdx: number) => {
    setCartLines((prev) =>
      prev.map((l, i) => {
        if (i !== lineIdx) return l;
        // Update existing _bundle_group or add it
        const has = l.attributes.some((a) => a.key === "_bundle_group");
        if (has) return l;
        return {
          ...l,
          attributes: [
            ...l.attributes,
            { key: "_bundle_group", value: "group-1" },
          ],
        };
      })
    );
    setSimResult(null);
  };

  const updateAttrKey = (lineIdx: number, attrIdx: number, val: string) => {
    setCartLines((prev) =>
      prev.map((l, i) =>
        i === lineIdx
          ? {
              ...l,
              attributes: l.attributes.map((a, j) =>
                j === attrIdx ? { ...a, key: val } : a
              ),
            }
          : l
      )
    );
    setSimResult(null);
  };

  const updateAttrValue = (lineIdx: number, attrIdx: number, val: string) => {
    setCartLines((prev) =>
      prev.map((l, i) =>
        i === lineIdx
          ? {
              ...l,
              attributes: l.attributes.map((a, j) =>
                j === attrIdx ? { ...a, value: val } : a
              ),
            }
          : l
      )
    );
    setSimResult(null);
  };

  const removeAttr = (lineIdx: number, attrIdx: number) => {
    setCartLines((prev) =>
      prev.map((l, i) =>
        i === lineIdx
          ? {
              ...l,
              attributes: l.attributes.filter((_, j) => j !== attrIdx),
            }
          : l
      )
    );
    setSimResult(null);
  };

  // ── Simulation ────────────────────────────────────────────────────────────

  const handleRunTransform = () => {
    if (cartLines.length === 0) return;
    setIsRunning(true);
    setTimeout(() => {
      const functionInput = buildFunctionInput(cartLines);
      const transform = simulateCartTransform(cartLines);
      setSimResult({ functionInput, transform });
      setShowInputJson(true);
      setShowOutputJson(true);
      setIsRunning(false);
    }, 150);
  };

  const clearCart = () => {
    setCartLines([]);
    setSimResult(null);
  };

  // ── Quick fixtures ────────────────────────────────────────────────────────

  const loadExpandFixture = () => {
    const bundle = bundles.find((b) => b.bundleType === "expand");
    if (!bundle) {
      shopify.toast.show("No expand bundle configured. Add one in the Bundles page first.", { isError: true });
      return;
    }
    setCartLines([
      {
        id: nextLineId(),
        variantId: bundle.variantId,
        variantTitle: bundle.variantTitle,
        productTitle: bundle.productTitle,
        quantity: 1,
        price: "50.00",
        attributes: [],
        bundleType: "expand",
        bundleComponents: bundle.components,
      },
    ]);
    setSimResult(null);
  };

  const loadMergeFixture = () => {
    const bundle = bundles.find((b) => b.bundleType === "merge");
    if (!bundle) {
      shopify.toast.show("No merge bundle configured. Add one in the Bundles page first.", { isError: true });
      return;
    }
    const groupId = bundle.mergeGroupName || "group-1";
    setCartLines([
      {
        id: nextLineId(),
        variantId: bundle.variantId,
        variantTitle: bundle.variantTitle,
        productTitle: bundle.productTitle,
        quantity: 1,
        price: "30.00",
        attributes: [{ key: "_bundle_group", value: groupId }],
        bundleType: "merge",
        bundleComponents: bundle.components,
      },
      {
        id: nextLineId(),
        variantId: `${bundle.variantId}-item2`,
        variantTitle: "Add-on Item",
        productTitle: bundle.productTitle,
        quantity: 1,
        price: "20.00",
        attributes: [{ key: "_bundle_group", value: groupId }],
        bundleType: "merge",
        bundleComponents: [],
      },
    ]);
    setSimResult(null);
  };

  const loadUpdateFixture = () => {
    const bundle = bundles.find((b) => b.bundleType === "update");
    if (!bundle) {
      shopify.toast.show("No update bundle configured. Add one in the Bundles page first.", { isError: true });
      return;
    }
    setCartLines([
      {
        id: nextLineId(),
        variantId: bundle.variantId,
        variantTitle: bundle.variantTitle,
        productTitle: bundle.productTitle,
        quantity: 1,
        price: bundle.priceOverride || "75.00",
        attributes: [],
        bundleType: "update",
        bundleComponents: [],
        titleOverride: bundle.titleOverride,
        priceOverride: bundle.priceOverride,
      },
    ]);
    setSimResult(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <s-page heading="Bundle Testing Dashboard">
      {/* ================================================================== */}
      {/* SECTION 1 — Configured bundles overview                             */}
      {/* ================================================================== */}
      <s-section heading="Configured Bundles">
        {bundles.length === 0 ? (
          <s-box padding="base">
            <s-paragraph>
              No bundles configured yet.{" "}
              <s-link href="/app/bundles">Go to Bundles</s-link> to set up your
              first bundle configuration.
            </s-paragraph>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">
                Product / Variant
              </s-table-header>
              <s-table-header listSlot="inline">Type</s-table-header>
              <s-table-header listSlot="labeled">Details</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {bundles.map((bundle) => (
                <s-table-row key={bundle.variantId}>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-100">
                      <s-text type="strong">{bundle.productTitle}</s-text>
                      <s-text tone="neutral">{bundle.variantTitle}</s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge tone={bundleTypeTone(bundle.bundleType)}>
                      {bundle.bundleType}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    {bundle.bundleType === "expand" &&
                      `${bundle.components.length} component(s): ${bundle.components.map((c) => c.variantLabel).join(", ")}`}
                    {bundle.bundleType === "merge" &&
                      (bundle.mergeGroupName
                        ? `Group: "${bundle.mergeGroupName}"`
                        : "No group name set")}
                    {bundle.bundleType === "update" &&
                      [
                        bundle.titleOverride
                          ? `Title → "${bundle.titleOverride}"`
                          : null,
                        bundle.priceOverride
                          ? `Price → $${bundle.priceOverride}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      {/* ================================================================== */}
      {/* SECTION 2 — Simulate Cart Transform                                 */}
      {/* ================================================================== */}
      <s-section heading="Simulate Cart Transform">
        <s-stack direction="block" gap="base">
          {/* Cart builder toolbar */}
          <s-stack direction="inline" gap="base">
            <s-button variant="primary" onClick={addVariantsToCart}>
              + Add to Cart
            </s-button>
            {cartLines.length > 0 && (
              <s-button variant="tertiary" tone="critical" onClick={clearCart}>
                Clear cart
              </s-button>
            )}
          </s-stack>

          {/* Cart lines */}
          {cartLines.length === 0 ? (
            <s-box padding="base" border="base" borderRadius="base">
              <s-paragraph>
                Your simulated cart is empty. Click{" "}
                <s-text type="strong">+ Add to Cart</s-text> to add products, or
                use a <s-text type="strong">Quick Test Fixture</s-text> below.
              </s-paragraph>
            </s-box>
          ) : (
            <s-stack direction="block" gap="base">
              {cartLines.map((line, lineIdx) => (
                <s-box
                  key={line.id}
                  padding="base"
                  border="base"
                  borderRadius="base"
                >
                  <s-stack direction="block" gap="base">
                    {/* Line header */}
                    <s-stack direction="inline" gap="base">
                      <s-stack direction="block" gap="small-100">
                        <s-text type="strong">{line.productTitle}</s-text>
                        <s-text tone="neutral">{line.variantTitle}</s-text>
                      </s-stack>
                      {line.bundleType && (
                        <s-badge tone={bundleTypeTone(line.bundleType)}>
                          {line.bundleType} bundle
                        </s-badge>
                      )}
                      <s-button
                        tone="critical"
                        variant="tertiary"
                        onClick={() => removeLine(lineIdx)}
                      >
                        Remove
                      </s-button>
                    </s-stack>

                    {/* Quantity + price */}
                    <s-stack direction="inline" gap="base">
                      <s-number-field
                        label="Quantity"
                        value={String(line.quantity)}
                        min={1}
                        onChange={(e: Event) =>
                          updateLineQuantity(
                            lineIdx,
                            (e.currentTarget as HTMLInputElement).value
                          )
                        }
                      />
                      <s-text-field
                        label="Price ($)"
                        value={line.price}
                        onChange={(e: Event) =>
                          updateLinePrice(
                            lineIdx,
                            (e.currentTarget as HTMLInputElement).value
                          )
                        }
                      />
                    </s-stack>

                    {/* Bundle components summary (read-only) */}
                    {line.bundleType === "expand" &&
                      line.bundleComponents &&
                      line.bundleComponents.length > 0 && (
                        <s-box
                          padding="small-200"
                          background="subdued"
                          borderRadius="base"
                        >
                          <s-text tone="neutral">
                            Will expand into:{" "}
                            {line.bundleComponents
                              .map(
                                (c) =>
                                  `${c.variantLabel} ×${c.quantity} @ $${c.price}`
                              )
                              .join(", ")}
                          </s-text>
                        </s-box>
                      )}

                    {/* Attributes */}
                    <s-stack direction="block" gap="small-200">
                      <s-text type="strong">Line attributes</s-text>
                      {line.attributes.map((attr, attrIdx) => (
                        <s-stack
                          key={attrIdx}
                          direction="inline"
                          gap="small-200"
                        >
                          <s-text-field
                            label="Key"
                            value={attr.key}
                            onChange={(e: Event) =>
                              updateAttrKey(
                                lineIdx,
                                attrIdx,
                                (e.currentTarget as HTMLInputElement).value
                              )
                            }
                          />
                          <s-text-field
                            label="Value"
                            value={attr.value}
                            onChange={(e: Event) =>
                              updateAttrValue(
                                lineIdx,
                                attrIdx,
                                (e.currentTarget as HTMLInputElement).value
                              )
                            }
                          />
                          <s-button
                            tone="critical"
                            variant="tertiary"
                            onClick={() => removeAttr(lineIdx, attrIdx)}
                          >
                            ✕
                          </s-button>
                        </s-stack>
                      ))}
                      <s-stack direction="inline" gap="small-200">
                        <s-button
                          variant="tertiary"
                          onClick={() => addAttr(lineIdx)}
                        >
                          + Custom attribute
                        </s-button>
                        <s-button
                          variant="tertiary"
                          onClick={() => addBundleGroupAttr(lineIdx)}
                        >
                          + _bundle_group
                        </s-button>
                      </s-stack>
                    </s-stack>
                  </s-stack>
                </s-box>
              ))}
            </s-stack>
          )}

          {/* Run transform */}
          {cartLines.length > 0 && (
            <s-button
              variant="primary"
              onClick={handleRunTransform}
              {...(isRunning ? { loading: true } : {})}
            >
              Run Transform
            </s-button>
          )}

          {/* ── Simulation results ───────────────────────────────────────── */}
          {simResult && (
            <s-stack direction="block" gap="base">
              <s-banner
                tone="success"
                heading={
                  simResult.transform.operations.length > 0
                    ? `Transform applied — ${simResult.transform.operations.length} operation(s)`
                    : "No operations — cart unchanged"
                }
              />

              {/* Function input JSON */}
              <s-box border="base" borderRadius="base" padding="base">
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base">
                    <s-text type="strong">Function Input JSON</s-text>
                    <s-button
                      variant="tertiary"
                      onClick={() => setShowInputJson((v) => !v)}
                    >
                      {showInputJson ? "Hide" : "Show"}
                    </s-button>
                  </s-stack>
                  {showInputJson && (
                    <s-box
                      padding="base"
                      background="subdued"
                      borderRadius="base"
                    >
                      <pre
                        style={{
                          margin: 0,
                          fontSize: "12px",
                          overflowX: "auto",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                      >
                        <code>
                          {JSON.stringify(simResult.functionInput, null, 2)}
                        </code>
                      </pre>
                    </s-box>
                  )}
                </s-stack>
              </s-box>

              {/* Operations output JSON */}
              <s-box border="base" borderRadius="base" padding="base">
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base">
                    <s-text type="strong">
                      Operations Output (function result)
                    </s-text>
                    <s-button
                      variant="tertiary"
                      onClick={() => setShowOutputJson((v) => !v)}
                    >
                      {showOutputJson ? "Hide" : "Show"}
                    </s-button>
                  </s-stack>
                  {showOutputJson && (
                    <s-box
                      padding="base"
                      background="subdued"
                      borderRadius="base"
                    >
                      <pre
                        style={{
                          margin: 0,
                          fontSize: "12px",
                          overflowX: "auto",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                      >
                        <code>
                          {JSON.stringify(
                            { operations: simResult.transform.operations },
                            null,
                            2
                          )}
                        </code>
                      </pre>
                    </s-box>
                  )}
                </s-stack>
              </s-box>

              {/* Before / After comparison */}
              <s-section heading="Before → After Comparison">
                <s-stack direction="block" gap="base">
                  <s-text type="strong">Before transform</s-text>
                  <s-table>
                    <s-table-header-row>
                      <s-table-header listSlot="primary">Item</s-table-header>
                      <s-table-header listSlot="inline">Qty</s-table-header>
                      <s-table-header listSlot="labeled">Price</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                      {simResult.transform.beforeLines.map((line) => (
                        <s-table-row key={line.id}>
                          <s-table-cell>
                            <s-stack direction="inline" gap="small-100">
                              <s-text>{line.title}</s-text>
                              {line.tag !== "unchanged" && (
                                <s-badge tone={bundleTypeTone(line.tag)}>
                                  {line.tag}
                                </s-badge>
                              )}
                            </s-stack>
                          </s-table-cell>
                          <s-table-cell>{line.quantity}</s-table-cell>
                          <s-table-cell>${line.price}</s-table-cell>
                        </s-table-row>
                      ))}
                    </s-table-body>
                  </s-table>

                  <s-text type="strong">After transform</s-text>
                  <s-table>
                    <s-table-header-row>
                      <s-table-header listSlot="primary">Item</s-table-header>
                      <s-table-header listSlot="inline">Qty</s-table-header>
                      <s-table-header listSlot="labeled">Price</s-table-header>
                      <s-table-header listSlot="labeled">Status</s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                      {simResult.transform.afterLines.map((line) => (
                        <s-table-row key={line.id}>
                          <s-table-cell>
                            <s-text>{line.title}</s-text>
                            {line.sourceLineIds && (
                              <s-text tone="neutral">
                                {" "}
                                (merged from {line.sourceLineIds.length} lines)
                              </s-text>
                            )}
                          </s-table-cell>
                          <s-table-cell>{line.quantity}</s-table-cell>
                          <s-table-cell>${line.price}</s-table-cell>
                          <s-table-cell>
                            <s-badge tone={tagTone(line.tag)}>
                              {line.tag}
                            </s-badge>
                          </s-table-cell>
                        </s-table-row>
                      ))}
                    </s-table-body>
                  </s-table>
                </s-stack>
              </s-section>
            </s-stack>
          )}
        </s-stack>
      </s-section>

      {/* ================================================================== */}
      {/* SECTION 3 — Quick Test Fixtures                                     */}
      {/* ================================================================== */}
      <s-section heading="Quick Test Fixtures">
        <s-paragraph>
          Load a pre-built test scenario into the simulator above with one
          click, then hit <s-text type="strong">Run Transform</s-text> to see
          the result.
        </s-paragraph>
        <s-stack direction="block" gap="base">
          {/* Expand fixture */}
          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-stack direction="inline" gap="base">
                <s-badge tone="info">expand</s-badge>
                <s-text type="strong">Expand Bundle</s-text>
              </s-stack>
              <s-paragraph>
                Loads the first configured expand bundle. When Run Transform is
                clicked, the parent cart line will be split into its component
                items.
              </s-paragraph>
              <s-stack direction="inline" gap="base">
                <s-button
                  variant="secondary"
                  onClick={() => {
                    loadExpandFixture();
                    setTimeout(handleRunTransform, 200);
                  }}
                >
                  Load &amp; Run
                </s-button>
                <s-button variant="tertiary" onClick={loadExpandFixture}>
                  Load only
                </s-button>
              </s-stack>
            </s-stack>
          </s-box>

          {/* Merge fixture */}
          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-stack direction="inline" gap="base">
                <s-badge tone="success">merge</s-badge>
                <s-text type="strong">Merge Lines</s-text>
              </s-stack>
              <s-paragraph>
                Loads two separate cart lines that share the same{" "}
                <s-text type="strong">_bundle_group</s-text> attribute. When Run
                Transform is clicked, they will be merged into a single bundle
                line.
              </s-paragraph>
              <s-stack direction="inline" gap="base">
                <s-button
                  variant="secondary"
                  onClick={() => {
                    loadMergeFixture();
                    setTimeout(handleRunTransform, 200);
                  }}
                >
                  Load &amp; Run
                </s-button>
                <s-button variant="tertiary" onClick={loadMergeFixture}>
                  Load only
                </s-button>
              </s-stack>
            </s-stack>
          </s-box>

          {/* Update fixture */}
          <s-box padding="base" border="base" borderRadius="base">
            <s-stack direction="block" gap="small-200">
              <s-stack direction="inline" gap="base">
                <s-badge tone="warning">update</s-badge>
                <s-text type="strong">Update Presentation</s-text>
              </s-stack>
              <s-paragraph>
                Loads the first configured update bundle. When Run Transform is
                clicked, the cart line&apos;s title and/or price will be overridden
                according to the bundle configuration.
              </s-paragraph>
              <s-stack direction="inline" gap="base">
                <s-button
                  variant="secondary"
                  onClick={() => {
                    loadUpdateFixture();
                    setTimeout(handleRunTransform, 200);
                  }}
                >
                  Load &amp; Run
                </s-button>
                <s-button variant="tertiary" onClick={loadUpdateFixture}>
                  Load only
                </s-button>
              </s-stack>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
