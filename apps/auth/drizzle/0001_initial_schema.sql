CREATE TYPE "public"."world_status" AS ENUM('DRAFT', 'OPEN', 'CLOSED', 'ENDED');--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"nickname" "citext" NOT NULL,
	"password_hash" text NOT NULL,
	"roles" text[] DEFAULT '{player}'::text[] NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_email_unique" UNIQUE("email"),
	CONSTRAINT "players_nickname_unique" UNIQUE("nickname"),
	CONSTRAINT "players_roles_valid" CHECK ("players"."roles" <@ ARRAY['player','tester','admin']::text[] AND 'player' = ANY("players"."roles"))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"player_id" uuid NOT NULL,
	"world_slug" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profiles_player_id_world_slug_pk" PRIMARY KEY("player_id","world_slug")
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"event_id" uuid PRIMARY KEY NOT NULL,
	"world_slug" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worlds" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"public_url" text NOT NULL,
	"admin_url" text NOT NULL,
	"status" "world_status" NOT NULL,
	"is_test" boolean NOT NULL,
	"reachable" boolean DEFAULT false NOT NULL,
	"last_probe_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_world_slug_worlds_slug_fk" FOREIGN KEY ("world_slug") REFERENCES "public"."worlds"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_idx" ON "refresh_tokens" USING btree ("token_hash");