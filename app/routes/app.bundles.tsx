import { useState, useRef, useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { GET_BUNDLE_PRODUCTS } from "../graphql/queries/getBundles";
import { SET_BUNDLE_METAFIELDS } from "../graphql/mutations/setBundleMetafields";
import { DELETE_BUNDLE_METAFIELDS } from "../graphql/mutations/deleteBundleMetafields";

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
  imageUrl?: string;
};

type ActionData = {
  success: boolean;
  error: string | null;
};

// ---------------------------------------------------------------------------
// Loader
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
          imageUrl?: string;
        };
        record.titleOverride = cfg.titleOverride;
        record.priceOverride = cfg.priceOverride;
        record.imageUrl = cfg.imageUrl;
      }

      bundles.push(record);
    }
  }

  return { bundles };
};

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const _action = formData.get("_action") as string;

  if (_action === "save") {
    const variantId = formData.get("variantId") as string;
    const bundleType = formData.get("bundleType") as string;
    const componentsJson = formData.get("components") as string;

    const response = await admin.graphql(SET_BUNDLE_METAFIELDS, {
      variables: {
        metafields: [
          {
            ownerId: variantId,
            namespace: "$app:bundle",
            key: "type",
            value: bundleType,
            type: "single_line_text_field",
          },
          {
            ownerId: variantId,
            namespace: "$app:bundle",
            key: "components",
            value: componentsJson,
            type: "json",
          },
        ],
      },
    });

    const data = (await response.json()) as {
      data?: { metafieldsSet?: { userErrors: Array<{ message: string }> } };
    };
    const errors = data.data?.metafieldsSet?.userErrors ?? [];
    if (errors.length > 0) {
      return { success: false, error: errors[0].message } satisfies ActionData;
    }
    return { success: true, error: null } satisfies ActionData;
  }

  if (_action === "delete") {
    const variantId = formData.get("variantId") as string;

    const response = await admin.graphql(DELETE_BUNDLE_METAFIELDS, {
      variables: {
        metafields: [
          { ownerId: variantId, namespace: "$app:bundle", key: "type" },
          { ownerId: variantId, namespace: "$app:bundle", key: "components" },
        ],
      },
    });

    const data = (await response.json()) as {
      data?: { metafieldsDelete?: { userErrors: Array<{ message: string }> } };
    };
    const errors = data.data?.metafieldsDelete?.userErrors ?? [];
    if (errors.length > 0) {
      return { success: false, error: errors[0].message } satisfies ActionData;
    }
    return { success: true, error: null } satisfies ActionData;
  }

  return { success: false, error: "Unknown action" } satisfies ActionData;
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

const EMPTY_COMPONENTS: ExpandComponent[] = [];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BundlesPage() {
  const { bundles } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();

  const modalRef = useRef<{
    showOverlay: () => void;
    hideOverlay: () => void;
  } | null>(null);

  // Form state
  const [parentVariantId, setParentVariantId] = useState("");
  const [parentVariantLabel, setParentVariantLabel] = useState("");
  const [bundleType, setBundleType] = useState<"expand" | "merge" | "update">(
    "expand"
  );
  const [components, setComponents] =
    useState<ExpandComponent[]>(EMPTY_COMPONENTS);
  const [mergeGroupName, setMergeGroupName] = useState("");
  const [titleOverride, setTitleOverride] = useState("");
  const [priceOverride, setPriceOverride] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);

  const isSubmitting = fetcher.state === "submitting";

  // Close modal / surface error after server response
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.success) {
        modalRef.current?.hideOverlay();
        setModalError(null);
      } else if (fetcher.data.error) {
        setModalError(fetcher.data.error);
      }
    }
  }, [fetcher.state, fetcher.data]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const openCreateModal = () => {
    setParentVariantId("");
    setParentVariantLabel("");
    setBundleType("expand");
    setComponents([]);
    setMergeGroupName("");
    setTitleOverride("");
    setPriceOverride("");
    setImageUrl("");
    setModalError(null);
    modalRef.current?.showOverlay();
  };

  const pickParentVariant = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selected = await (shopify as any).resourcePicker({
      type: "variant",
      multiple: false,
    });
    if (selected?.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = selected[0] as any;
      setParentVariantId(v.id as string);
      const productTitle: string = v.product?.title ?? "Unknown product";
      const variantTitle: string = v.title ?? "Default Title";
      setParentVariantLabel(`${productTitle} — ${variantTitle}`);
    }
  };

  const pickComponentVariants = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selected = await (shopify as any).resourcePicker({
      type: "variant",
      multiple: true,
    });
    if (selected?.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newComponents: ExpandComponent[] = (selected as any[]).map((v) => ({
        variantId: v.id as string,
        variantLabel: `${v.product?.title ?? "Unknown"} — ${v.title ?? "Default Title"}`,
        quantity: 1,
        price: (v.price as string) ?? "0.00",
      }));
      setComponents((prev) => [...prev, ...newComponents]);
    }
  };

  const removeComponent = (index: number) => {
    setComponents((prev) => prev.filter((_, i) => i !== index));
  };

  const updateComponentField = (
    index: number,
    field: keyof Pick<ExpandComponent, "quantity" | "price">,
    value: string
  ) => {
    setComponents((prev) =>
      prev.map((c, i) =>
        i === index
          ? { ...c, [field]: field === "quantity" ? parseInt(value, 10) || 1 : value }
          : c
      )
    );
  };

  const handleSave = () => {
    if (!parentVariantId) {
      setModalError("Please select a parent variant.");
      return;
    }
    setModalError(null);

    let payload: unknown;
    if (bundleType === "expand") {
      payload = components.map(({ variantId, quantity, price }) => ({
        variantId,
        quantity,
        price,
      }));
    } else if (bundleType === "merge") {
      payload = { groupName: mergeGroupName };
    } else {
      payload = { titleOverride, priceOverride, imageUrl };
    }

    fetcher.submit(
      {
        _action: "save",
        variantId: parentVariantId,
        bundleType,
        components: JSON.stringify(payload),
      },
      { method: "POST" }
    );
  };

  const handleDelete = (variantId: string) => {
    fetcher.submit(
      { _action: "delete", variantId },
      { method: "POST" }
    );
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <s-page heading="Bundle Configuration">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={openCreateModal}
      >
        Create bundle
      </s-button>

      {fetcher.data?.error && !modalError && (
        <s-banner tone="critical" heading="Error saving bundle">
          {fetcher.data.error}
        </s-banner>
      )}

      <s-section heading="Bundle configurations" padding="none">
        {bundles.length === 0 ? (
          <s-box padding="base">
            <s-paragraph>
              No bundles configured yet. Click{" "}
              <s-text type="strong">Create bundle</s-text> to add a bundle
              configuration to a product variant.
            </s-paragraph>
          </s-box>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">
                Product / Variant
              </s-table-header>
              <s-table-header listSlot="inline">Bundle type</s-table-header>
              <s-table-header listSlot="labeled">Configuration</s-table-header>
              <s-table-header listSlot="labeled">Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {bundles.map((bundle) => (
                <s-table-row key={bundle.variantId}>
                  <s-table-cell>
                    <s-stack direction="block" gap="small-100">
                      <s-text>{bundle.productTitle}</s-text>
                      <s-text tone="neutral">{bundle.variantTitle}</s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge tone={bundleTypeTone(bundle.bundleType)}>
                      {bundle.bundleType}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    {bundle.bundleType === "expand"
                      ? `${bundle.components.length} component(s)`
                      : bundle.bundleType === "merge"
                      ? bundle.mergeGroupName
                        ? `Group: ${bundle.mergeGroupName}`
                        : "Merge group"
                      : bundle.titleOverride || bundle.priceOverride
                      ? [
                          bundle.titleOverride
                            ? `Title: ${bundle.titleOverride}`
                            : null,
                          bundle.priceOverride
                            ? `Price: $${bundle.priceOverride}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(", ")
                      : "Update config"}
                  </s-table-cell>
                  <s-table-cell>
                    <s-button
                      tone="critical"
                      variant="tertiary"
                      onClick={() => handleDelete(bundle.variantId)}
                      {...(isSubmitting ? { disabled: true } : {})}
                    >
                      Delete
                    </s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      {/* ------------------------------------------------------------------ */}
      {/* Create / Edit Modal                                                  */}
      {/* ------------------------------------------------------------------ */}
      <s-modal
        ref={modalRef}
        heading="Create bundle configuration"
        size="large"
      >
        <s-stack gap="base">
          {modalError && (
            <s-banner tone="critical" heading="Validation error">
              {modalError}
            </s-banner>
          )}

          {/* Parent variant selection */}
          <s-section heading="Parent variant">
            <s-stack direction="inline" gap="base">
              {parentVariantId ? (
                <>
                  <s-text>{parentVariantLabel}</s-text>
                  <s-button variant="tertiary" onClick={pickParentVariant}>
                    Change
                  </s-button>
                </>
              ) : (
                <s-button onClick={pickParentVariant}>
                  Select variant
                </s-button>
              )}
            </s-stack>
          </s-section>

          {/* Bundle type */}
          <s-section heading="Bundle type">
            <s-select
              label="Type"
              value={bundleType}
              onChange={(e: Event) =>
                setBundleType(
                  (e.currentTarget as HTMLSelectElement)
                    .value as typeof bundleType
                )
              }
            >
              <s-option value="expand">
                Expand — split into component items
              </s-option>
              <s-option value="merge">
                Merge — combine multiple items
              </s-option>
              <s-option value="update">
                Update — modify title or price
              </s-option>
            </s-select>
          </s-section>

          {/* Expand: component list */}
          {bundleType === "expand" && (
            <s-section heading="Components">
              <s-stack gap="base">
                {components.map((component, index) => (
                  <s-box
                    key={index}
                    padding="base"
                    border="base"
                    borderRadius="base"
                  >
                    <s-stack gap="base">
                      <s-stack direction="inline" gap="base">
                        <s-text type="strong">
                          {component.variantLabel}
                        </s-text>
                        <s-button
                          tone="critical"
                          variant="tertiary"
                          onClick={() => removeComponent(index)}
                        >
                          Remove
                        </s-button>
                      </s-stack>
                      <s-stack direction="inline" gap="base">
                        <s-number-field
                          label="Quantity"
                          value={String(component.quantity)}
                          min={1}
                          onChange={(e: Event) =>
                            updateComponentField(
                              index,
                              "quantity",
                              (e.currentTarget as HTMLInputElement).value
                            )
                          }
                        />
                        <s-text-field
                          label="Price per unit ($)"
                          value={component.price}
                          onChange={(e: Event) =>
                            updateComponentField(
                              index,
                              "price",
                              (e.currentTarget as HTMLInputElement).value
                            )
                          }
                        />
                      </s-stack>
                    </s-stack>
                  </s-box>
                ))}
                <s-button variant="secondary" onClick={pickComponentVariants}>
                  Add component variant(s)
                </s-button>
              </s-stack>
            </s-section>
          )}

          {/* Merge configuration */}
          {bundleType === "merge" && (
            <s-section heading="Merge configuration">
              <s-text-field
                label="Group name"
                value={mergeGroupName}
                details="Cart items with this group ID (via _bundle_group attribute) will be merged"
                onChange={(e: Event) =>
                  setMergeGroupName(
                    (e.currentTarget as HTMLInputElement).value
                  )
                }
              />
            </s-section>
          )}

          {/* Update configuration */}
          {bundleType === "update" && (
            <s-section heading="Update configuration">
              <s-stack gap="base">
                <s-text-field
                  label="Title override"
                  value={titleOverride}
                  details="Replaces the cart line title. Leave empty to keep the original."
                  onChange={(e: Event) =>
                    setTitleOverride(
                      (e.currentTarget as HTMLInputElement).value
                    )
                  }
                />
                <s-text-field
                  label="Price override ($)"
                  value={priceOverride}
                  details="Overrides the cart line price. Leave empty to keep the original."
                  onChange={(e: Event) =>
                    setPriceOverride(
                      (e.currentTarget as HTMLInputElement).value
                    )
                  }
                />
                <s-text-field
                  label="Image URL"
                  value={imageUrl}
                  details="Optional custom image URL for the cart line item."
                  onChange={(e: Event) =>
                    setImageUrl((e.currentTarget as HTMLInputElement).value)
                  }
                />
              </s-stack>
            </s-section>
          )}
        </s-stack>

        <s-button
          slot="primary-action"
          variant="primary"
          onClick={handleSave}
          {...(isSubmitting ? { loading: true } : {})}
        >
          Save bundle
        </s-button>
        <s-button
          slot="secondary-actions"
          variant="secondary"
          onClick={() => modalRef.current?.hideOverlay()}
        >
          Cancel
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
