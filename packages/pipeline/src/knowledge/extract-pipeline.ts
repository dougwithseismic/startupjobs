import { isNull, eq } from "drizzle-orm";
import type { Db } from "../db/connection.js";
import { jobListings } from "../db/schema.js";
import { extractEntities } from "./extract.js";
import { storeExtraction } from "./store.js";
import { translateListing } from "./translate.js";

export async function runExtraction(
  db: Db,
  options?: { limit?: number; model?: string; translateModel?: string },
) {
  const limit = options?.limit ?? 1000;

  const unextracted = await db
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

  console.log(`  ${unextracted.length} jobs pending extraction`);

  let processed = 0;
  let totalEntities = 0;
  let translated = 0;

  for (const job of unextracted) {
    try {
      let titleEn = job.titleEn ?? job.title;
      let descEn = job.description;
      let lang = job.detectedLanguage;

      if (!lang) {
        const translation = await translateListing(
          job.title,
          job.description,
          { model: options?.translateModel },
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

      const extraction = await extractEntities(titleEn, descEn, job.company, {
        model: options?.model,
      });

      const count = await storeExtraction(db, job.id, extraction);
      totalEntities += count;
      processed++;

      const entitySummary = Object.entries(extraction)
        .filter(([, v]) => (v as string[]).length > 0)
        .map(([k, v]) => `${(v as string[]).length} ${k}`)
        .join(", ");

      const langTag = lang !== "en" ? ` [${lang}→en]` : "";
      console.log(
        `  [${processed}/${unextracted.length}] ${job.title}${langTag} → ${entitySummary || "no entities"}`,
      );
    } catch (err) {
      console.error(
        `  [${processed + 1}/${unextracted.length}] FAILED: ${job.title} — ${err}`,
      );
      processed++;
    }
  }

  console.log(
    `\nExtraction complete: ${processed} jobs processed, ${translated} translated, ${totalEntities} entity relations`,
  );
}
