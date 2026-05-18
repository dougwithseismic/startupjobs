import { inArray } from "drizzle-orm";
import { StartupJobsClient } from "@repo/startupjobs-api";
import type { OfferListItem } from "@repo/startupjobs-api";
import { createDb, type Db } from "../db/connection.js";
import { jobListings } from "../db/schema.js";
import { crawlAllOffers } from "../crawler/crawl-offers.js";
import { computeHash } from "./content-hash.js";
import { runExtraction } from "../knowledge/extract-pipeline.js";

function offerHash(offer: OfferListItem): string {
  return computeHash([
    offer.name,
    offer.description,
    offer.company,
    offer.locations,
  ]);
}

async function crawlAndUpsert(db: Db) {
  const client = new StartupJobsClient();
  let totalUpserted = 0;
  let totalSkipped = 0;
  let pageNum = 0;

  for await (const page of crawlAllOffers(client)) {
    pageNum++;
    const sourceIds = page.map((o) => o.id);

    const existing = await db
      .select({
        sourceId: jobListings.sourceId,
        contentHash: jobListings.contentHash,
      })
      .from(jobListings)
      .where(inArray(jobListings.sourceId, sourceIds));

    const existingMap = new Map(
      existing.map((e) => [e.sourceId, e.contentHash]),
    );

    const changed = page.filter(
      (offer) => existingMap.get(offer.id) !== offerHash(offer),
    );

    if (changed.length === 0) {
      totalSkipped += page.length;
      console.log(`  Page ${pageNum}: ${page.length} unchanged, skipped`);
      continue;
    }

    for (const offer of changed) {
      const hash = offerHash(offer);
      const values = {
        sourceId: offer.id,
        title: offer.name,
        description: offer.description,
        url: offer.url,
        company: offer.company,
        companyType: offer.companyType,
        isStartup: offer.isStartup,
        mainArea: offer.mainAreaName,
        areaSlugs: offer.areaSlugs,
        areaNames: offer.areaNames,
        seniorities: offer.seniorities,
        contract: [],
        locations: offer.locations,
        isRemote: offer.isRemote,
        salary: offer.salary,
        isHot: offer.isHot,
        isTop: offer.isTop,
        benefits: offer.benefits,
        contentHash: hash,
        extractedAt: null,
        updatedAt: new Date(),
      };

      await db
        .insert(jobListings)
        .values(values)
        .onConflictDoUpdate({ target: jobListings.sourceId, set: values });

      totalUpserted++;
    }

    totalSkipped += page.length - changed.length;
    console.log(
      `  Page ${pageNum}: ${changed.length} upserted, ${page.length - changed.length} unchanged`,
    );
  }

  console.log(
    `  Crawl done: ${totalUpserted} upserted, ${totalSkipped} unchanged`,
  );
}

export async function runSync(options?: { extractLimit?: number }) {
  const db = createDb();
  const extractLimit = options?.extractLimit ?? 1000;

  console.log("Step 1/2: Crawl & upsert...");
  await crawlAndUpsert(db);
  console.log("");

  console.log("Step 2/2: Translate & extract knowledge graph...");
  await runExtraction(db, { limit: extractLimit });
  console.log("");

  console.log("Pipeline complete (vectorless — KG + BM25 search ready).");
}
