import { eq, inArray, isNull } from "drizzle-orm";
import { StartupJobsClient } from "@repo/startupjobs-api";
import type { OfferListItem } from "@repo/startupjobs-api";
import { createDb, type Db } from "../db/connection.js";
import { jobListings, entities, jobEntities } from "../db/schema.js";
import { embedTexts } from "../embeddings/ollama.js";
import { crawlAllOffers } from "../crawler/crawl-offers.js";
import { computeHash } from "./content-hash.js";
import { translateListing } from "../knowledge/translate.js";
import { extractEntities } from "../knowledge/extract.js";
import { storeExtraction } from "../knowledge/store.js";

function offerHash(offer: OfferListItem): string {
  return computeHash([
    offer.name,
    offer.description,
    offer.company,
    offer.locations,
  ]);
}

function buildEnrichedEmbeddingText(
  job: {
    titleEn: string | null;
    title: string;
    company: string;
    seniorities: string[] | null;
    locations: string | null;
    isRemote: boolean | null;
  },
  extractedEntities: {
    skills: string[];
    technologies: string[];
    languages: string[];
    frameworks: string[];
    tools: string[];
    platforms: string[];
    methodologies: string[];
    soft_skills: string[];
    industry: string[];
  },
): string {
  const parts = [
    `search_document: ${job.titleEn ?? job.title} | ${job.company}`,
  ];

  const skills = [
    ...extractedEntities.skills,
    ...extractedEntities.technologies,
  ];
  if (skills.length) parts.push(`Skills: ${skills.join(", ")}`);

  const langs = extractedEntities.languages;
  if (langs.length) parts.push(`Languages: ${langs.join(", ")}`);

  const frameworks = extractedEntities.frameworks;
  if (frameworks.length) parts.push(`Frameworks: ${frameworks.join(", ")}`);

  const tools = [
    ...extractedEntities.tools,
    ...extractedEntities.platforms,
  ];
  if (tools.length) parts.push(`Tools: ${tools.join(", ")}`);

  if (extractedEntities.industry.length)
    parts.push(`Industry: ${extractedEntities.industry.join(", ")}`);

  const seniorities = job.seniorities ?? [];
  if (seniorities.length)
    parts.push(`Seniority: ${seniorities.join(", ")}`);

  if (job.isRemote) parts.push("Remote: yes");

  if (job.locations) parts.push(`Location: ${job.locations}`);

  return parts.join(" | ");
}

// Step 1: Crawl and upsert raw data (no embedding yet)
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
        embedding: null,
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

// Step 2: Translate + extract entities for unprocessed jobs
async function translateAndExtract(db: Db, limit: number) {
  const unprocessed = await db
    .select({
      id: jobListings.id,
      sourceId: jobListings.sourceId,
      title: jobListings.title,
      description: jobListings.description,
      company: jobListings.company,
      detectedLanguage: jobListings.detectedLanguage,
      titleEn: jobListings.titleEn,
    })
    .from(jobListings)
    .where(isNull(jobListings.extractedAt))
    .limit(limit);

  console.log(`  ${unprocessed.length} jobs need translate + extract`);

  let processed = 0;
  let translated = 0;

  for (const job of unprocessed) {
    try {
      let titleEn = job.titleEn ?? job.title;
      let descEn = job.description;
      let lang = job.detectedLanguage;

      if (!lang) {
        const translation = await translateListing(
          job.title,
          job.description,
        );
        titleEn = translation.titleEn;
        descEn = translation.descriptionEn;
        lang = translation.detectedLanguage;

        await db
          .update(jobListings)
          .set({
            detectedLanguage: lang,
            titleEn: translation.titleEn,
            descriptionEn: translation.descriptionEn,
          })
          .where(eq(jobListings.id, job.id));

        if (lang !== "en") translated++;
      }

      const extraction = await extractEntities(titleEn, descEn, job.company);
      await storeExtraction(db, job.id, extraction);
      processed++;

      const summary = Object.entries(extraction)
        .filter(([, v]) => (v as string[]).length > 0)
        .map(([k, v]) => `${(v as string[]).length} ${k}`)
        .join(", ");

      const langTag = lang !== "en" ? ` [${lang}→en]` : "";
      console.log(
        `  [${processed}/${unprocessed.length}] ${job.title}${langTag} → ${summary || "no entities"}`,
      );
    } catch (err) {
      console.error(
        `  [${processed + 1}/${unprocessed.length}] FAILED: ${job.title} — ${err}`,
      );
      processed++;
    }
  }

  console.log(
    `  Extract done: ${processed} processed, ${translated} translated`,
  );
}

// Step 3: Embed from enriched knowledge graph data
async function embedFromKnowledgeGraph(db: Db) {
  const jobsToEmbed = await db
    .select({
      id: jobListings.id,
      sourceId: jobListings.sourceId,
      title: jobListings.title,
      titleEn: jobListings.titleEn,
      company: jobListings.company,
      seniorities: jobListings.seniorities,
      locations: jobListings.locations,
      isRemote: jobListings.isRemote,
    })
    .from(jobListings)
    .where(isNull(jobListings.embedding));

  // Also get jobs that were extracted but have old embeddings (from before enrichment)
  const reembedJobs = await db
    .select({
      id: jobListings.id,
      sourceId: jobListings.sourceId,
      title: jobListings.title,
      titleEn: jobListings.titleEn,
      company: jobListings.company,
      seniorities: jobListings.seniorities,
      locations: jobListings.locations,
      isRemote: jobListings.isRemote,
    })
    .from(jobListings)
    .where(isNull(jobListings.embedding));

  const allJobs = jobsToEmbed;
  if (allJobs.length === 0) {
    console.log("  No jobs need embedding");
    return;
  }

  console.log(`  ${allJobs.length} jobs need embedding`);

  const BATCH_SIZE = 10;
  let embedded = 0;

  for (let i = 0; i < allJobs.length; i += BATCH_SIZE) {
    const batch = allJobs.slice(i, i + BATCH_SIZE);

    const textsToEmbed: string[] = [];

    for (const job of batch) {
      const jobEntityRows = await db
        .select({ name: entities.name, type: entities.type })
        .from(jobEntities)
        .innerJoin(entities, eq(entities.id, jobEntities.entityId))
        .where(eq(jobEntities.jobId, job.id));

      const grouped: Record<string, string[]> = {};
      for (const row of jobEntityRows) {
        const key = row.type;
        if (!grouped[key]) grouped[key] = [];
        grouped[key]!.push(row.name);
      }

      const extractedEntities = {
        skills: grouped["skill"] ?? [],
        technologies: grouped["technology"] ?? [],
        languages: grouped["language"] ?? [],
        frameworks: grouped["framework"] ?? [],
        tools: grouped["tool"] ?? [],
        platforms: grouped["platform"] ?? [],
        methodologies: grouped["methodology"] ?? [],
        soft_skills: grouped["soft_skill"] ?? [],
        industry: grouped["industry"] ?? [],
      };

      textsToEmbed.push(
        buildEnrichedEmbeddingText(job, extractedEntities),
      );
    }

    const embeddings = await embedTexts(textsToEmbed);

    for (let j = 0; j < batch.length; j++) {
      await db
        .update(jobListings)
        .set({ embedding: embeddings[j]! })
        .where(eq(jobListings.id, batch[j]!.id));
    }

    embedded += batch.length;
    console.log(`  Embedded ${embedded}/${allJobs.length}`);
  }

  console.log(`  Embed done: ${embedded} jobs embedded with enriched text`);
}

export async function runSync(options?: { extractLimit?: number }) {
  const db = createDb();
  const extractLimit = options?.extractLimit ?? 1000;

  console.log("Step 1/3: Crawl & upsert...");
  await crawlAndUpsert(db);
  console.log("");

  console.log("Step 2/3: Translate & extract...");
  await translateAndExtract(db, extractLimit);
  console.log("");

  console.log("Step 3/3: Embed from knowledge graph...");
  await embedFromKnowledgeGraph(db);
  console.log("");

  console.log("Pipeline complete.");
}
