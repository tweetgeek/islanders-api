CREATE TYPE "public"."biome_type" AS ENUM('TROPICAL', 'TEMPERATE', 'VOLCANIC');--> statement-breakpoint
CREATE TYPE "public"."building_type" AS ENUM('TOWN_HALL', 'BARRACKS', 'SHIPYARD', 'WAREHOUSE', 'SAWMILL', 'QUARRY', 'FARM', 'IRON_MINE', 'SULFUR_PIT');--> statement-breakpoint
CREATE TYPE "public"."mission_type" AS ENUM('COLONIZE', 'ATTACK', 'TRANSPORT', 'EXPEDITION', 'RETURN');--> statement-breakpoint
CREATE TYPE "public"."world_status" AS ENUM('DRAFT', 'OPEN', 'CLOSED', 'ENDED');--> statement-breakpoint
CREATE TABLE "world_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" "world_status" DEFAULT 'DRAFT' NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"seed" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"wind_x" double precision DEFAULT 0 NOT NULL,
	"wind_y" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_settings_singleton" CHECK ("world_settings"."id" = 1),
	CONSTRAINT "world_settings_seed_31bit" CHECK ("world_settings"."seed" >= 0 AND "world_settings"."seed" <= 2147483647),
	CONSTRAINT "world_settings_size_positive" CHECK ("world_settings"."width" > 0 AND "world_settings"."height" > 0)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"player_id" uuid PRIMARY KEY NOT NULL,
	"nickname" "citext" NOT NULL,
	"home_x" integer,
	"home_y" integer,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_nickname_unique" UNIQUE("nickname")
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(32) NOT NULL,
	"biome" "biome_type" NOT NULL,
	"wood" numeric(14, 4) NOT NULL,
	"stone" numeric(14, 4) NOT NULL,
	"food" numeric(14, 4) NOT NULL,
	"iron" numeric(14, 4) NOT NULL,
	"sulfur" numeric(14, 4) NOT NULL,
	"population" integer DEFAULT 0 NOT NULL,
	"last_sync_at" timestamp with time zone NOT NULL,
	"founded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_pk" PRIMARY KEY("x","y"),
	CONSTRAINT "settlements_xy_biome_unique" UNIQUE("x","y","biome")
);
--> statement-breakpoint
CREATE TABLE "biome_buildings" (
	"biome" "biome_type" NOT NULL,
	"type" "building_type" NOT NULL,
	CONSTRAINT "biome_buildings_biome_type_pk" PRIMARY KEY("biome","type")
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"biome" "biome_type" NOT NULL,
	"type" "building_type" NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "buildings_pk" PRIMARY KEY("x","y","type"),
	CONSTRAINT "buildings_level_nonnegative" CHECK ("buildings"."level" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fleets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"mission" "mission_type" NOT NULL,
	"from_x" integer NOT NULL,
	"from_y" integer NOT NULL,
	"to_x" integer NOT NULL,
	"to_y" integer NOT NULL,
	"ships" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cargo" jsonb DEFAULT '{"units":{},"resources":{}}'::jsonb NOT NULL,
	"depart_at" timestamp with time zone NOT NULL,
	"arrive_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deposits_taken" (
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"wood" numeric(14, 4) DEFAULT 0 NOT NULL,
	"stone" numeric(14, 4) DEFAULT 0 NOT NULL,
	"food" numeric(14, 4) DEFAULT 0 NOT NULL,
	"iron" numeric(14, 4) DEFAULT 0 NOT NULL,
	"sulfur" numeric(14, 4) DEFAULT 0 NOT NULL,
	CONSTRAINT "deposits_taken_pk" PRIMARY KEY("x","y")
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_owner_id_profiles_player_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("player_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_settlement_biome_fk" FOREIGN KEY ("x","y","biome") REFERENCES "public"."settlements"("x","y","biome") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_biome_type_fk" FOREIGN KEY ("biome","type") REFERENCES "public"."biome_buildings"("biome","type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleets" ADD CONSTRAINT "fleets_owner_id_profiles_player_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("player_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "settlements_owner_idx" ON "settlements" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "fleets_owner_idx" ON "fleets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "fleets_target_idx" ON "fleets" USING btree ("to_x","to_y");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox" USING btree ("created_at") WHERE "outbox"."sent_at" IS NULL;