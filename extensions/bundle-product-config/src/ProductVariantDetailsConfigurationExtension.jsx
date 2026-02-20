import "@shopify/ui-extensions/preact";
import {render} from "preact";
import {useState, useEffect} from "preact/hooks";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const {i18n} = shopify;
  const bundleData = useVariantBundleData();

  if (bundleData.loading) {
    return (
      <s-admin-block heading={i18n.translate("title")}>
        <s-stack direction="block" gap="base">
          <s-spinner />
        </s-stack>
      </s-admin-block>
    );
  }

  if (bundleData.error) {
    return (
      <s-admin-block heading={i18n.translate("title")}>
        <s-banner tone="critical" heading={i18n.translate("errorHeading")}>
          {bundleData.error}
        </s-banner>
      </s-admin-block>
    );
  }

  if (!bundleData.variant) {
    return (
      <s-admin-block heading={i18n.translate("title")}>
        <s-stack direction="block" gap="base">
          <s-text>{i18n.translate("noBundles")}</s-text>
        </s-stack>
      </s-admin-block>
    );
  }

  const {variant} = bundleData;
  const toneLookup = {expand: "info", merge: "success", update: "warning"};

  return (
    <s-admin-block heading={i18n.translate("title")}>
      <s-stack direction="block" gap="large-200">
        <s-stack direction="inline" gap="base">
          <s-text type="strong">{variant.title}</s-text>
          <s-badge tone={toneLookup[variant.bundleType] || "info"}>
            {variant.bundleType}
          </s-badge>
        </s-stack>

        {variant.bundleType === "expand" &&
          Array.isArray(variant.components) &&
          variant.components.length > 0 && (
            <ExpandComponentsTable components={variant.components} />
          )}

        {variant.bundleType === "merge" && variant.config?.groupName && (
          <s-stack direction="block" gap="small-100">
            <s-text tone="neutral">
              {i18n.translate("mergeGroup")}: {variant.config.groupName}
            </s-text>
          </s-stack>
        )}

        {variant.bundleType === "update" && (
          <UpdateDetails config={variant.config} />
        )}
      </s-stack>
    </s-admin-block>
  );
}

function ExpandComponentsTable({components}) {
  const {i18n} = shopify;

  return (
    <s-table>
      <s-table-header-row>
        <s-table-header listSlot="primary">
          {i18n.translate("componentHeader")}
        </s-table-header>
        <s-table-header listSlot="inline">
          {i18n.translate("qtyHeader")}
        </s-table-header>
        <s-table-header listSlot="inline">
          {i18n.translate("priceHeader")}
        </s-table-header>
      </s-table-header-row>
      <s-table-body>
        {components.map((comp, idx) => (
          <s-table-row key={idx}>
            <s-table-cell>
              <s-text>{comp.resolvedTitle || shortenGid(comp.variantId)}</s-text>
            </s-table-cell>
            <s-table-cell>
              <s-text>{String(comp.quantity)}</s-text>
            </s-table-cell>
            <s-table-cell>
              <s-text>${comp.price}</s-text>
            </s-table-cell>
          </s-table-row>
        ))}
      </s-table-body>
    </s-table>
  );
}

function UpdateDetails({config}) {
  const {i18n} = shopify;

  if (!config) return null;

  const hasTitle = config.titleOverride;
  const hasPrice = config.priceOverride;

  if (!hasTitle && !hasPrice) {
    return (
      <s-text tone="neutral">{i18n.translate("noOverrides")}</s-text>
    );
  }

  return (
    <s-stack direction="block" gap="small-100">
      {hasTitle && (
        <s-text tone="neutral">
          {i18n.translate("titleOverride")}: {config.titleOverride}
        </s-text>
      )}
      {hasPrice && (
        <s-text tone="neutral">
          {i18n.translate("priceOverride")}: ${config.priceOverride}
        </s-text>
      )}
    </s-stack>
  );
}

function shortenGid(gid) {
  if (!gid) return "Unknown";
  const match = gid.match(/\/(\d+)$/);
  return match ? `Variant #${match[1]}` : gid;
}

function useVariantBundleData() {
  const {data, query} = shopify;
  const variantId = data?.selected?.[0]?.id;
  const [state, setState] = useState({
    loading: true,
    error: null,
    variant: null,
  });

  useEffect(() => {
    if (!variantId) {
      setState({loading: false, error: null, variant: null});
      return;
    }

    setState((prev) => ({...prev, loading: true}));

    query(
      `#graphql
      query GetVariantBundle($id: ID!) {
        productVariant(id: $id) {
          id
          title
          price
          bundleType: metafield(namespace: "$app:bundle", key: "type") {
            value
          }
          bundleComponents: metafield(namespace: "$app:bundle", key: "components") {
            value
          }
          product {
            id
            title
          }
        }
      }`,
      {variables: {id: variantId}}
    )
      .then(async ({data: result, errors}) => {
        if (errors) {
          setState({
            loading: false,
            error: errors.map((e) => e.message).join(", "),
            variant: null,
          });
          return;
        }

        const v = result?.productVariant;
        if (!v || !v.bundleType?.value) {
          setState({loading: false, error: null, variant: null});
          return;
        }

        let parsed = null;
        try {
          parsed = v.bundleComponents?.value
            ? JSON.parse(v.bundleComponents.value)
            : null;
        } catch (_) {
          parsed = null;
        }

        const bundleType = v.bundleType.value;
        let components = [];
        let config = null;

        if (bundleType === "expand" && Array.isArray(parsed)) {
          components = parsed;
        } else if (parsed && typeof parsed === "object") {
          config = parsed;
        }

        const variant = {
          id: v.id,
          title: v.title,
          price: v.price,
          bundleType,
          components,
          config,
          productTitle: v.product?.title,
        };

        // Resolve component variant titles for expand bundles
        if (bundleType === "expand" && components.length > 0) {
          const variantIds = components
            .map((c) => c.variantId)
            .filter(Boolean);
          if (variantIds.length > 0) {
            await resolveVariantTitles(query, variantIds, components);
          }
        }

        setState({loading: false, error: null, variant});
      })
      .catch((err) => {
        setState({loading: false, error: err.message, variant: null});
      });
  }, [variantId, query]);

  return state;
}

async function resolveVariantTitles(query, variantIds, components) {
  const nodeQueries = variantIds
    .map(
      (id, i) =>
        `v${i}: node(id: "${id}") { ... on ProductVariant { id title product { title } } }`
    )
    .join("\n");

  try {
    const {data: result} = await query(`{ ${nodeQueries} }`);
    if (!result) return;

    const titleMap = {};
    for (const key of Object.keys(result)) {
      const node = result[key];
      if (node?.id && node?.title) {
        const productTitle = node.product?.title || "";
        titleMap[node.id] = productTitle
          ? `${productTitle} — ${node.title}`
          : node.title;
      }
    }

    for (const comp of components) {
      if (titleMap[comp.variantId]) {
        comp.resolvedTitle = titleMap[comp.variantId];
      }
    }
  } catch (_) {
    // Gracefully fall back to showing variant IDs
  }
}
