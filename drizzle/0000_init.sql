CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"player_count" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_kind" text DEFAULT 'standard' NOT NULL,
	"creator_token_hash" text NOT NULL,
	"current_phase_id" integer,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_sets" (
	"phase_id" integer NOT NULL,
	"power" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"orders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"submit_request_id" text,
	CONSTRAINT "order_sets_phase_id_power_pk" PRIMARY KEY("phase_id","power")
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" text PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"display_name" text NOT NULL,
	"seat" integer,
	"is_game_master" boolean DEFAULT false NOT NULL,
	"join_token_hash" text,
	"device_token_hash" text,
	"bound_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "phases" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" text NOT NULL,
	"seq" integer NOT NULL,
	"year" integer NOT NULL,
	"season" text NOT NULL,
	"phase" text NOT NULL,
	"state" jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"record" jsonb,
	"trigger" text,
	"adjudicated_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"timer_set_at" timestamp with time zone,
	"timer_extensions" integer DEFAULT 0 NOT NULL,
	"checklist_ticks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"board_synced_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "order_sets" ADD CONSTRAINT "order_sets_phase_id_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phases" ADD CONSTRAINT "phases_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "games_code_idx" ON "games" USING btree ("code");