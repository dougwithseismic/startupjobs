import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// --- Job Listings ---

export const jobListings = pgTable(
  "job_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: integer("source_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    url: text("url"),
    company: text("company").notNull(),
    companyType: varchar("company_type", { length: 50 }),
    isStartup: boolean("is_startup").default(false),
    mainArea: varchar("main_area", { length: 100 }),
    areaSlugs: jsonb("area_slugs").$type<string[]>().default([]),
    areaNames: jsonb("area_names").$type<string[]>().default([]),
    seniorities: jsonb("seniorities").$type<string[]>().default([]),
    contract: jsonb("contract").$type<string[]>().default([]),
    locations: text("locations"),
    isRemote: boolean("is_remote").default(false),
    salary: jsonb("salary"),
    isHot: boolean("is_hot").default(false),
    isTop: boolean("is_top").default(false),
    benefits: jsonb("benefits").$type<number[]>().default([]),
    detectedLanguage: varchar("detected_language", { length: 10 }),
    titleEn: text("title_en"),
    descriptionEn: text("description_en"),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    extractedAt: timestamp("extracted_at"),
    syncedAt: timestamp("synced_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_source_id").on(table.sourceId),
  ],
);

// --- Knowledge Graph ---

export const entityTypeEnum = pgEnum("entity_type", [
  "skill",
  "technology",
  "language",
  "framework",
  "tool",
  "platform",
  "industry",
  "methodology",
  "certification",
  "soft_skill",
  "spoken_language",
]);

export const relationTypeEnum = pgEnum("relation_type", [
  "requires",
  "prefers",
  "teaches",
  "uses",
  "offers",
  "belongs_to",
]);

export const entities = pgTable(
  "entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 255 }).notNull(),
    type: entityTypeEnum("type").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_entity_unique").on(table.normalizedName, table.type),
    index("idx_entity_type").on(table.type),
    index("idx_entity_name").on(table.normalizedName),
  ],
);

export const jobEntities = pgTable(
  "job_entities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobListings.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    relation: relationTypeEnum("relation").notNull().default("requires"),
    confidence: integer("confidence").default(100),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_job_entity_unique").on(
      table.jobId,
      table.entityId,
      table.relation,
    ),
    index("idx_job_entities_job").on(table.jobId),
    index("idx_job_entities_entity").on(table.entityId),
  ],
);
