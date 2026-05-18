import type { StartupJobsClient, OfferListItem } from "@repo/startupjobs-api";

export async function* crawlAllOffers(
  client: StartupJobsClient,
): AsyncGenerator<OfferListItem[], void, unknown> {
  let page = 1;

  while (true) {
    const response = await client.front.listOffers({ page });
    yield response.resultSet;

    if (page >= response.paginator.max) break;
    page++;

    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
