// Auto-generated types for the cart transform function
// These are manually written to match the run.graphql input query shape.

export type RunInput = {
  presentmentCurrencyRate: number;
  cart: {
    lines: Array<{
      id: string;
      quantity: number;
      cost: {
        amountPerQuantity: {
          amount: string;
          currencyCode: string;
        };
      };
      merchandise:
        | { __typename: "CustomProduct" }
        | {
            __typename: "ProductVariant";
            id: string;
            title: string;
            product: {
              bundleComponents: { jsonValue: unknown } | null;
              bundleType: { value: string } | null;
            };
          };
      attributes: Array<{ key: string; value: string | null }>;
    }>;
  };
  cartTransform: {
    metafield: { jsonValue: unknown } | null;
  } | null;
};

// ---------- Output types ----------

export type AttributeOutput = {
  key: string;
  value: string;
};

export type ExpandedItemFixedPricePerUnitAdjustment = {
  amount: string;
};

export type ExpandedItemPriceAdjustmentValue = {
  fixedPricePerUnit: ExpandedItemFixedPricePerUnitAdjustment;
};

export type ExpandedItemPriceAdjustment = {
  adjustment: ExpandedItemPriceAdjustmentValue;
};

export type ExpandedItem = {
  merchandiseId: string;
  quantity: number;
  price?: ExpandedItemPriceAdjustment | null;
  attributes?: AttributeOutput[] | null;
};

export type LineExpandOperation = {
  cartLineId: string;
  expandedCartItems: ExpandedItem[];
  title?: string | null;
  image?: { url: string } | null;
  price?: ExpandedItemPriceAdjustment | null;
};

export type CartLineInput = {
  cartLineId: string;
  quantity: number;
};

export type PriceAdjustmentValue = {
  value: string;
};

export type PriceAdjustment = {
  percentageDecrease?: PriceAdjustmentValue | null;
};

export type LinesMergeOperation = {
  cartLines: CartLineInput[];
  parentVariantId: string;
  title?: string | null;
  price?: PriceAdjustment | null;
  image?: { url: string } | null;
  attributes?: AttributeOutput[] | null;
};

export type LineUpdateOperationFixedPricePerUnitAdjustment = {
  amount: string;
};

export type LineUpdateOperationPriceAdjustmentValue = {
  fixedPricePerUnit: LineUpdateOperationFixedPricePerUnitAdjustment;
};

export type LineUpdateOperationPriceAdjustment = {
  adjustment: LineUpdateOperationPriceAdjustmentValue;
};

export type LineUpdateOperation = {
  cartLineId: string;
  title?: string | null;
  price?: LineUpdateOperationPriceAdjustment | null;
  image?: { url: string } | null;
};

export type Operation =
  | { lineExpand: LineExpandOperation }
  | { linesMerge: LinesMergeOperation }
  | { lineUpdate: LineUpdateOperation };

export type CartTransformRunResult = {
  operations: Operation[];
};
