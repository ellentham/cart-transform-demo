/**
 * Client-side simulation of the cart transform function logic.
 * Mirrors the behaviour in extensions/bundle-transform/src/run.ts.
 */

export type BundleComponent = {
  variantId: string;
  variantLabel: string;
  quantity: number;
  price: string;
};

export type SimCartLine = {
  id: string;
  variantId: string;
  variantTitle: string;
  productTitle: string;
  quantity: number;
  price: string;
  attributes: { key: string; value: string }[];
  bundleType?: "expand" | "merge" | "update";
  bundleComponents?: BundleComponent[];
  titleOverride?: string;
  priceOverride?: string;
};

export type TransformedLine = {
  id: string;
  variantId: string;
  title: string;
  quantity: number;
  price: string;
  tag: "expanded" | "merged" | "updated" | "unchanged";
  sourceLineIds?: string[];
};

export type SimOperation =
  | {
      type: "expand";
      cartLineId: string;
      expandedItems: TransformedLine[];
    }
  | {
      type: "merge";
      cartLineIds: string[];
      mergedLine: TransformedLine;
    }
  | {
      type: "update";
      cartLineId: string;
      title?: string;
      price?: string;
    };

export type SimTransformResult = {
  operations: SimOperation[];
  beforeLines: TransformedLine[];
  afterLines: TransformedLine[];
};

export function simulateCartTransform(
  cartLines: SimCartLine[],
  currencyRate = 1
): SimTransformResult {
  const operations: SimOperation[] = [];
  const afterLines: TransformedLine[] = [];
  const processedIds = new Set<string>();
  const mergeGroups = new Map<string, SimCartLine[]>();

  const beforeLines: TransformedLine[] = cartLines.map((l) => ({
    id: l.id,
    variantId: l.variantId,
    title: `${l.productTitle} — ${l.variantTitle}`,
    quantity: l.quantity,
    price: l.price,
    tag: "unchanged" as const,
  }));

  for (const line of cartLines) {
    if (!line.bundleType) continue;

    if (line.bundleType === "expand") {
      const components = line.bundleComponents ?? [];
      if (components.length === 0) continue;

      processedIds.add(line.id);

      const expandedItems: TransformedLine[] = components.map((comp, i) => ({
        id: `${line.id}-exp-${i}`,
        variantId: comp.variantId,
        title: comp.variantLabel || comp.variantId,
        quantity: comp.quantity * line.quantity,
        price: (parseFloat(comp.price) * currencyRate).toFixed(2),
        tag: "expanded" as const,
      }));

      operations.push({ type: "expand", cartLineId: line.id, expandedItems });
      afterLines.push(...expandedItems);
    } else if (line.bundleType === "merge") {
      const groupAttr = line.attributes.find((a) => a.key === "_bundle_group");
      const groupId = groupAttr?.value;
      if (!groupId) continue;

      const existing = mergeGroups.get(groupId) ?? [];
      existing.push(line);
      mergeGroups.set(groupId, existing);
      processedIds.add(line.id);
    } else if (line.bundleType === "update") {
      processedIds.add(line.id);

      const newTitle =
        line.titleOverride || `${line.productTitle} — ${line.variantTitle}`;
      const newPrice = line.priceOverride
        ? (parseFloat(line.priceOverride) * currencyRate).toFixed(2)
        : line.price;

      operations.push({
        type: "update",
        cartLineId: line.id,
        title: line.titleOverride,
        price: line.priceOverride,
      });

      afterLines.push({
        id: line.id,
        variantId: line.variantId,
        title: newTitle,
        quantity: line.quantity,
        price: newPrice,
        tag: "updated",
      });
    }
  }

  // Process merge groups
  for (const [groupId, lines] of mergeGroups.entries()) {
    if (lines.length < 2) {
      // Not enough lines — treat as unprocessed
      for (const l of lines) processedIds.delete(l.id);
      continue;
    }

    const parentLine =
      lines.find((l) => l.bundleComponents && l.bundleComponents.length > 0) ??
      lines[0];
    const totalQuantity = lines.reduce((s, l) => s + l.quantity, 0);
    const totalPrice = lines
      .reduce((s, l) => s + parseFloat(l.price) * l.quantity, 0)
      .toFixed(2);

    const mergedLine: TransformedLine = {
      id: `merged-${groupId}`,
      variantId: parentLine.variantId,
      title: `${parentLine.variantTitle} Bundle`,
      quantity: totalQuantity,
      price: totalPrice,
      tag: "merged",
      sourceLineIds: lines.map((l) => l.id),
    };

    operations.push({
      type: "merge",
      cartLineIds: lines.map((l) => l.id),
      mergedLine,
    });
    afterLines.push(mergedLine);
  }

  // Pass through unprocessed lines
  for (const line of cartLines) {
    if (!processedIds.has(line.id)) {
      afterLines.push({
        id: line.id,
        variantId: line.variantId,
        title: `${line.productTitle} — ${line.variantTitle}`,
        quantity: line.quantity,
        price: line.price,
        tag: "unchanged",
      });
    }
  }

  return { operations, beforeLines, afterLines };
}
