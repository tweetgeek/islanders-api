CREATE TYPE "public"."biome_type" AS ENUM('TROPICAL', 'TEMPERATE', 'VOLCANIC');--> statement-breakpoint
CREATE TYPE "public"."building_type" AS ENUM('TOWN_HALL', 'BARRACKS', 'SHIPYARD', 'WAREHOUSE', 'SAWMILL', 'QUARRY', 'FARM', 'IRON_MINE', 'SULFUR_PIT');--> statement-breakpoint
CREATE TYPE "public"."mission_type" AS ENUM('COLONIZE', 'ATTACK', 'TRANSPORT', 'EXPEDITION', 'RETURN');--> statement-breakpoint
CREATE TYPE "public"."world_status" AS ENUM('OPEN', 'CLOSED', 'ENDED');--> statement-breakpoint
CREATE TABLE "worlds" (
	"id" serial PRIMARY KEY NOT NULL,
	"seed" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"wind_x" double precision DEFAULT 0 NOT NULL,
	"wind_y" double precision DEFAULT 0 NOT NULL,
	"status" "world_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worlds_seed_31bit" CHECK ("worlds"."seed" >= 0 AND "worlds"."seed" <= 2147483647)
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" "citext" NOT NULL,
	"nickname" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_email_unique" UNIQUE("email"),
	CONSTRAINT "players_nickname_unique" UNIQUE("nickname")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"world_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"home_x" integer,
	"home_y" integer,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_pk" PRIMARY KEY("world_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"world_id" integer NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"owner_id" integer NOT NULL,
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
	CONSTRAINT "settlements_pk" PRIMARY KEY("world_id","x","y"),
	CONSTRAINT "settlements_world_xy_biome_unique" UNIQUE("world_id","x","y","biome")
);
--> statement-breakpoint
CREATE TABLE "biome_buildings" (
	"biome" "biome_type" NOT NULL,
	"type" "building_type" NOT NULL,
	CONSTRAINT "biome_buildings_biome_type_pk" PRIMARY KEY("biome","type")
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"world_id" integer NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"biome" "biome_type" NOT NULL,
	"type" "building_type" NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "buildings_world_id_x_y_type_pk" PRIMARY KEY("world_id","x","y","type"),
	CONSTRAINT "buildings_level_nonnegative" CHECK ("buildings"."level" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fleets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" integer NOT NULL,
	"owner_id" integer NOT NULL,
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
	"world_id" integer NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"wood" numeric(14, 4) DEFAULT 0 NOT NULL,
	"stone" numeric(14, 4) DEFAULT 0 NOT NULL,
	"food" numeric(14, 4) DEFAULT 0 NOT NULL,
	"iron" numeric(14, 4) DEFAULT 0 NOT NULL,
	"sulfur" numeric(14, 4) DEFAULT 0 NOT NULL,
	CONSTRAINT "deposits_taken_world_id_x_y_pk" PRIMARY KEY("world_id","x","y")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_owner_id_players_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_settlement_biome_fk" FOREIGN KEY ("world_id","x","y","biome") REFERENCES "public"."settlements"("world_id","x","y","biome") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_biome_type_fk" FOREIGN KEY ("biome","type") REFERENCES "public"."biome_buildings"("biome","type") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleets" ADD CONSTRAINT "fleets_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleets" ADD CONSTRAINT "fleets_owner_id_players_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposits_taken" ADD CONSTRAINT "deposits_taken_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "settlements_world_owner_idx" ON "settlements" USING btree ("world_id","owner_id");--> statement-breakpoint
CREATE INDEX "fleets_world_owner_idx" ON "fleets" USING btree ("world_id","owner_id");--> statement-breakpoint
CREATE INDEX "fleets_world_target_idx" ON "fleets" USING btree ("world_id","to_x","to_y");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_idx" ON "refresh_tokens" USING btree ("token_hash");