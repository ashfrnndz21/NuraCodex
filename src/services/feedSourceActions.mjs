export function feedSourceLinkVisibility(detailsMounted) {
  return {
    inDetails: detailsMounted,
    compact: !detailsMounted,
  };
}
