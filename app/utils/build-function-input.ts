/**
 * Constructs the exact JSON that the cart transform Shopify Function would
 * receive as input (matching the shape defined in run.graphql).
 */

import type { SimCartLine } from "./simulate-transform";

export type FunctionInput = {
  presentmentCurrencyRate: number;
  cart: {
    lines: FunctionCartLine[];
  };
  cartTransform: {
    metafield: null | { jsonValue: unknown };
  };
};

type FunctionCartLine = {
  id: string;
  quantity: number;
  cost: {
    amountPerQuantity: {
      amount: string;
      currencyCode: string;
    };
  };
  merchandise: {
    __typename: "ProductVariant";
    id: string;
    title: string;
    product: {
      bundleComponents: { jsonValue: unknown } | null;
      bundleType: { value: string } | null;
    };
  };
  attributes: { key: string; value: string }[];
};

export function buildFunctionInput(
  cartLines: SimCartLine[],
  currencyRate = 1
): FunctionInput {
  const lines: FunctionCartLine[] = cartLines.map((line) => {
    let componentsJsonValue: unknown = null;
    if (line.bundleComponents && line.bundleComponents.length > 0) {
      componentsJsonValue = line.bundleComponents.map((c) => ({
        variantId: c.variantId,
        quantity: c.quantity,
        price: c.price,
      }));
    }

    return {
      id: line.id,
      quantity: line.quantity,
      cost: {
        amountPerQuantity: {
          amount: line.price,
          currencyCode: "USD",
        },
      },
      merchandise: {
        __typename: "ProductVariant" as const,
        id: line.variantId,
        title: line.variantTitle,
        product: {
          bundleComponents: componentsJsonValue
            ? { jsonValue: componentsJsonValue }
            : null,
          bundleType: line.bundleType ? { value: line.bundleType } : null,
        },
      },
      attributes: line.attributes,
    };
  });

  // Collect update config from the first update-type line
  const updateLine = cartLines.find((l) => l.bundleType === "update");
  const updateConfig =
    updateLine && (updateLine.titleOverride || updateLine.priceOverride)
      ? { title: updateLine.titleOverride, price: updateLine.priceOverride }
      : null;

  return {
    presentmentCurrencyRate: currencyRate,
    cart: { lines },
    cartTransform: {
      metafield: updateConfig ? { jsonValue: updateConfig } : null,
    },
  };
}
