import { eq, and } from "drizzle-orm";
import type { Db } from "../db/connection.js";
import { entities, jobEntities, jobListings } from "../db/schema.js";
import type { ExtractedEntities } from "./extract.js";

type EntityType =
  | "skill"
  | "technology"
  | "language"
  | "framework"
  | "tool"
  | "platform"
  | "methodology"
  | "soft_skill"
  | "industry";

type RelationType = "requires" | "prefers" | "belongs_to";

const TYPE_MAP: Record<keyof ExtractedEntities, EntityType> = {
  skills: "skill",
  technologies: "technology",
  languages: "language",
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
  frameworks: "requires",
  tools: "requires",
  platforms: "requires",
  methodologies: "requires",
  soft_skills: "prefers",
  industry: "belongs_to",
};

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9+#.]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function getOrCreateEntity(
  db: Db,
  name: string,
  type: EntityType,
): Promise<string> {
  const normalizedName = normalize(name);

  const existing = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.normalizedName, normalizedName), eq(entities.type, type)))
    .limit(1);

  if (existing.length > 0) return existing[0]!.id;

  const [inserted] = await db
    .insert(entities)
    .values({ name, normalizedName, type })
    .onConflictDoNothing()
    .returning({ id: entities.id });

  if (inserted) return inserted.id;

  const [found] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.normalizedName, normalizedName), eq(entities.type, type)))
    .limit(1);

  return found!.id;
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
