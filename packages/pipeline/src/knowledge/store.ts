import { eq, and } from "drizzle-orm";
import type { Db } from "../db/connection.js";
import { entities, jobEntities, jobListings } from "../db/schema.js";
import type { ExtractedEntities } from "./extract.js";
import { normalizeEntityName } from "../llm/normalize.js";

type EntityType =
  | "skill"
  | "technology"
  | "language"
  | "framework"
  | "tool"
  | "platform"
  | "methodology"
  | "soft_skill"
  | "industry"
  | "spoken_language";

type RelationType = "requires" | "prefers" | "belongs_to";

const TYPE_MAP: Record<keyof ExtractedEntities, EntityType> = {
  skills: "skill",
  technologies: "technology",
  languages: "language",
  spokenLanguages: "spoken_language",
  frameworks: "framework",
  tools: "tool",
  platforms: "platform",
  methodologies: "methodology",
  soft_skills: "soft_skill",
  industry: "industry",
};

const RELATION_MAP: Record<keyof ExtractedEntities, RelationType> = {
  skills: "requires",
  technologies: "requires",
  languages: "requires",
  spokenLanguages: "requires",
  frameworks: "requires",
  tools: "requires",
  platforms: "requires",
  methodologies: "requires",
  soft_skills: "prefers",
  industry: "belongs_to",
};

const entityCache = new Map<string, string>();

async function getOrCreateEntity(
  db: Db,
  name: string,
  type: EntityType,
): Promise<string> {
  const normalized = normalizeEntityName(name);
  const cacheKey = `${normalized}:${type}`;

  const cached = entityCache.get(cacheKey);
  if (cached) return cached;

  const [inserted] = await db
    .insert(entities)
    .values({ name, normalizedName: normalized, type })
    .onConflictDoNothing()
    .returning({ id: entities.id });

  if (inserted) {
    entityCache.set(cacheKey, inserted.id);
    return inserted.id;
  }

  const [found] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(
      and(
        eq(entities.normalizedName, normalized),
        eq(entities.type, type),
      ),
    )
    .limit(1);

  const id = found!.id;
  entityCache.set(cacheKey, id);
  return id;
}

export async function storeExtraction(
  db: Db,
  jobId: string,
  extraction: ExtractedEntities,
): Promise<number> {
  let stored = 0;

  for (const [key, names] of Object.entries(extraction)) {
    const entityType = TYPE_MAP[key as keyof ExtractedEntities];
    const relation = RELATION_MAP[key as keyof ExtractedEntities];
    if (!entityType || !relation) continue;

    for (const name of names as string[]) {
      const entityId = await getOrCreateEntity(db, name, entityType);

      await db
        .insert(jobEntities)
        .values({ jobId, entityId, relation })
        .onConflictDoNothing();

      stored++;
    }
  }

  await db
    .update(jobListings)
    .set({ extractedAt: new Date() })
    .where(eq(jobListings.id, jobId));

  return stored;
}
