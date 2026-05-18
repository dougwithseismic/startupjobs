import { eq, inArray, isNull } from "drizzle-orm";
import { StartupJobsClient } from "@repo/startupjobs-api";
import type { OfferListItem } from "@repo/startupjobs-api";
import { createDb, type Db } from "../db/connection.js";
import { jobListings, entities, jobEntities } from "../db/schema.js";
import { embedTexts } from "../embeddings/ollama.js";
import { crawlAllOffers } from "../crawler/crawl-offers.js";
import { computeHash } from "./content-hash.js";
import { runExtraction } from "../knowledge/extract-pipeline.js";
import type { ExtractedEntities } from "../knowledge/extract.js";

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
  extracted: ExtractedEntities,
): string {
  const parts = [
    `search_document: ${job.titleEn ?? job.title} | ${job.company}`,
  ];

  const skills = [...extracted.skills, ...extracted.technologies];
  if (skills.length) parts.push(`Skills: ${skills.join(", ")}`);

  if (extracted.languages.length)
    parts.push(`Languages: ${extracted.languages.join(", ")}`);

  if (extracted.frameworks.length)
    parts.push(`Frameworks: ${extracted.frameworks.join(", ")}`);

  const tools = [...extracted.tools, ...extracted.platforms];
  if (tools.length) parts.push(`Tools: ${tools.join(", ")}`);

  if (extracted.industry.length)
    parts.push(`Industry: ${extracted.industry.join(", ")}`);

  const seniorities = job.seniorities ?? [];
  if (seniorities.length)
    parts.push(`Seniority: ${seniorities.join(", ")}`);

  if (job.isRemote) parts.push("Remote: yes");
  if (job.locations) parts.push(`Location: ${job.locations}`);

  return parts.join(" | ");
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

  if (jobsToEmbed.length === 0) {
    console.log("  No jobs need embedding");
    return;
  }

  console.log(`  ${jobsToEmbed.length} jobs need embedding`);

  const jobIds = jobsToEmbed.map((j) => j.id);
  const allEntityRows = await db
    .select({
      jobId: jobEntities.jobId,
      name: entities.name,
      type: entities.type,
    })
    .from(jobEntities)
    .innerJoin(entities, eq(entities.id, jobEntities.entityId))
    .where(inArray(jobEntities.jobId, jobIds));

  const entityMap = new Map<string, ExtractedEntities>();
  for (const row of allEntityRows) {
    if (!entityMap.has(row.jobId)) {
      entityMap.set(row.jobId, {
        skills: [], technologies: [], languages: [], frameworks: [],
        tools: [], platforms: [], methodologies: [], soft_skills: [], industry: [],
      });
    }
    const e = entityMap.get(row.jobId)!;
    const key =
      row.type === "skill" ? "skills" :
      row.type === "technology" ? "technologies" :
      row.type === "methodology" ? "methodologies" :
      row.type === "soft_skill" ? "soft_skills" :
      (row.type + "s") as keyof ExtractedEntities;
    if (key in e) (e[key] as string[]).push(row.name);
  }

  const BATCH_SIZE = 10;
  let embedded = 0;

  for (let i = 0; i < jobsToEmbed.length; i += BATCH_SIZE) {
    const batch = jobsToEmbed.slice(i, i + BATCH_SIZE);

    const textsToEmbed = batch.map((job) => {
      const extracted = entityMap.get(job.id) ?? {
        skills: [], technologies: [], languages: [], frameworks: [],
        tools: [], platforms: [], methodologies: [], soft_skills: [], industry: [],
      };
      return buildEnrichedEmbeddingText(job, extracted);
    });

    const embeddings = await embedTexts(textsToEmbed);

    await Promise.all(
      batch.map((job, j) =>
        db
          .update(jobListings)
          .set({ embedding: embeddings[j]! })
          .where(eq(jobListings.id, job.id)),
      ),
    );

    embedded += batch.length;
    console.log(`  Embedded ${embedded}/${jobsToEmbed.length}`);
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
  await runExtraction(db, { limit: extractLimit });
  console.log("");

  console.log("Step 3/3: Embed from knowledge graph...");
  await embedFromKnowledgeGraph(db);
  console.log("");

  console.log("Pipeline complete.");
}
