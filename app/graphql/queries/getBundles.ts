export const GET_BUNDLE_PRODUCTS = `#graphql
  query GetBundleProducts($query: String!) {
    products(first: 50, query: $query) {
      edges {
        node {
          id
          title
          variants(first: 10) {
            edges {
              node {
                id
                title
                price
                bundleComponents: metafield(namespace: "$app:bundle", key: "components") {
                  value
                }
                bundleType: metafield(namespace: "$app:bundle", key: "type") {
                  value
                }
              }
            }
          }
        }
      }
    }
  }
`;
