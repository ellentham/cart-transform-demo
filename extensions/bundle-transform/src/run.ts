import type {
  RunInput,
  CartTransformRunResult,
  Operation,
  ExpandedItem,
  CartLineInput,
} from "./generated/api";

type BundleComponent = {
  variantId: string;
  quantity: number;
  price: string;
};

const NO_CHANGES: CartTransformRunResult = { operations: [] };

export function cartTransformRun(input: RunInput): CartTransformRunResult {
  const operations: Operation[] = [];
  const currencyRate = parseFloat(String(input.presentmentCurrencyRate));
  const mergeGroups: Map<string, { cartLineId: string; quantity: number }[]> =
    new Map();

  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== "ProductVariant") {
      continue;
    }

    const variant = line.merchandise;
    const bundleType = variant.product.bundleType?.value ?? null;

    if (!bundleType) {
      continue;
    }

    if (bundleType === "expand") {
      const bundleComponentsRaw = variant.product.bundleComponents?.jsonValue;
      if (!bundleComponentsRaw) continue;

      const components = bundleComponentsRaw as BundleComponent[];
      if (!Array.isArray(components) || components.length === 0) continue;

      const expandedCartItems: ExpandedItem[] = components.map((component) => ({
        merchandiseId: component.variantId,
        quantity: component.quantity,
        price: {
          adjustment: {
            fixedPricePerUnit: {
              amount: (
                parseFloat(component.price) * currencyRate
              ).toFixed(2),
            },
          },
        },
      }));

      operations.push({
        lineExpand: {
          cartLineId: line.id,
          title: variant.title,
          expandedCartItems,
        },
      });
    } else if (bundleType === "merge") {
      const bundleGroupAttr = line.attributes.find(
        (a) => a.key === "_bundle_group"
      );
      const groupId = bundleGroupAttr?.value;
      if (!groupId) continue;

      const existing = mergeGroups.get(groupId) ?? [];
      existing.push({ cartLineId: line.id, quantity: line.quantity });
      mergeGroups.set(groupId, existing);
    } else if (bundleType === "update") {
      const config = input.cartTransform?.metafield?.jsonValue as
        | { title?: string; price?: string }
        | null
        | undefined;

      const updateOp: Operation = {
        lineUpdate: {
          cartLineId: line.id,
          title: config?.title ?? undefined,
          price: config?.price
            ? {
                adjustment: {
                  fixedPricePerUnit: {
                    amount: (
                      parseFloat(config.price) * currencyRate
                    ).toFixed(2),
                  },
                },
              }
            : undefined,
        },
      };

      operations.push(updateOp);
    }
  }

  // Process merge groups — each group becomes a linesMerge operation.
  // We need the parentVariantId from the bundleComponents metafield on one of
  // the lines in the group.
  for (const [groupId, cartLines] of mergeGroups.entries()) {
    if (cartLines.length < 2) continue;

    // Find the parent variant from the first line in the group that has
    // bundleComponents (the "parent" bundle line).
    let parentVariantId: string | null = null;
    let groupTitle: string | null = null;

    for (const line of input.cart.lines) {
      if (line.merchandise.__typename !== "ProductVariant") continue;
      const groupAttr = line.attributes.find((a) => a.key === "_bundle_group");
      if (groupAttr?.value !== groupId) continue;

      const componentsRaw =
        line.merchandise.product.bundleComponents?.jsonValue;
      if (componentsRaw) {
        const components = componentsRaw as BundleComponent[];
        if (Array.isArray(components) && components.length > 0) {
          parentVariantId = line.merchandise.id;
          groupTitle = `${line.merchandise.title} Bundle`;
          break;
        }
      }
    }

    if (!parentVariantId) {
      // Fall back to the first line's variant as parent
      const firstLineId = cartLines[0]?.cartLineId;
      const firstLine = input.cart.lines.find((l) => l.id === firstLineId);
      if (
        firstLine &&
        firstLine.merchandise.__typename === "ProductVariant"
      ) {
        parentVariantId = firstLine.merchandise.id;
        groupTitle = `${firstLine.merchandise.title} Bundle`;
      }
    }

    if (!parentVariantId) continue;

    const mergeCartLines: CartLineInput[] = cartLines.map((cl) => ({
      cartLineId: cl.cartLineId,
      quantity: cl.quantity,
    }));

    operations.push({
      linesMerge: {
        cartLines: mergeCartLines,
        parentVariantId,
        title: groupTitle ?? undefined,
      },
    });
  }

  return operations.length > 0 ? { operations } : NO_CHANGES;
}
