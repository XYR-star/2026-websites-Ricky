import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_role" AS ENUM('admin');
  CREATE TYPE "public"."enum_posts_type" AS ENUM('blog', 'travel', 'research');
  CREATE TYPE "public"."enum_posts_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum_posts_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__posts_v_version_type" AS ENUM('blog', 'travel', 'research');
  CREATE TYPE "public"."enum__posts_v_version_visibility" AS ENUM('public', 'private');
  CREATE TYPE "public"."enum__posts_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_deployments_status" AS ENUM('not-configured', 'pending', 'requested', 'failed');
  CREATE TYPE "public"."enum_homepage_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__homepage_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_about_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__about_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_now_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__now_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_projects_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__projects_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_tracks_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__tracks_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_site_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__site_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "users_sessions" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "created_at" timestamp(3) with time zone,
    "expires_at" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE "users" (
    "id" serial PRIMARY KEY NOT NULL,
    "role" "enum_users_role" DEFAULT 'admin' NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "email" varchar NOT NULL,
    "reset_password_token" varchar,
    "reset_password_expiration" timestamp(3) with time zone,
    "salt" varchar,
    "hash" varchar,
    "reset_password_requested_at" timestamp(3) with time zone,
    "login_attempts" numeric DEFAULT 0,
    "lock_until" timestamp(3) with time zone
  );

  CREATE TABLE "posts_tags" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "tag" varchar
  );

  CREATE TABLE "posts_links" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "label" varchar,
    "href" varchar
  );

  CREATE TABLE "posts" (
    "id" serial PRIMARY KEY NOT NULL,
    "title" varchar,
    "type" "enum_posts_type" DEFAULT 'blog',
    "date" timestamp(3) with time zone,
    "description" varchar,
    "summary" varchar,
    "body" jsonb,
    "cover_id" integer,
    "visibility" "enum_posts_visibility" DEFAULT 'public',
    "slug" varchar,
    "route_key" varchar,
    "media_id" varchar,
    "legacy_cover_url" varchar,
    "project" varchar,
    "status" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "_status" "enum_posts_status" DEFAULT 'draft'
  );

  CREATE TABLE "_posts_v_version_tags" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "tag" varchar,
    "_uuid" varchar
  );

  CREATE TABLE "_posts_v_version_links" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "label" varchar,
    "href" varchar,
    "_uuid" varchar
  );

  CREATE TABLE "_posts_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "parent_id" integer,
    "version_title" varchar,
    "version_type" "enum__posts_v_version_type" DEFAULT 'blog',
    "version_date" timestamp(3) with time zone,
    "version_description" varchar,
    "version_summary" varchar,
    "version_body" jsonb,
    "version_cover_id" integer,
    "version_visibility" "enum__posts_v_version_visibility" DEFAULT 'public',
    "version_slug" varchar,
    "version_route_key" varchar,
    "version_media_id" varchar,
    "version_legacy_cover_url" varchar,
    "version_project" varchar,
    "version_status" varchar,
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "version__status" "enum__posts_v_version_status" DEFAULT 'draft',
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean,
    "autosave" boolean
  );

  CREATE TABLE "media" (
    "id" serial PRIMARY KEY NOT NULL,
    "alt" varchar NOT NULL,
    "media_id" varchar,
    "public_url" varchar,
    "public_key" varchar,
    "original_url" varchar,
    "prefix" varchar DEFAULT 'drafts',
    "_objectkey" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "url" varchar,
    "thumbnail_u_r_l" varchar,
    "filename" varchar,
    "mime_type" varchar,
    "filesize" numeric,
    "width" numeric,
    "height" numeric,
    "focal_x" numeric,
    "focal_y" numeric
  );

  CREATE TABLE "deployments" (
    "id" serial PRIMARY KEY NOT NULL,
    "event_key" varchar NOT NULL,
    "label" varchar NOT NULL,
    "status" "enum_deployments_status" NOT NULL,
    "message" varchar,
    "job_id" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_kv" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar NOT NULL,
    "data" jsonb NOT NULL
  );

  CREATE TABLE "payload_locked_documents" (
    "id" serial PRIMARY KEY NOT NULL,
    "global_slug" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_locked_documents_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "users_id" integer,
    "posts_id" integer,
    "media_id" integer,
    "deployments_id" integer
  );

  CREATE TABLE "payload_preferences" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar,
    "value" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "payload_preferences_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "users_id" integer
  );

  CREATE TABLE "payload_migrations" (
    "id" serial PRIMARY KEY NOT NULL,
    "name" varchar,
    "batch" numeric,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "homepage_blocks_magazine_cover" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "travel_slug" varchar DEFAULT '',
    "block_name" varchar
  );

  CREATE TABLE "homepage_blocks_magazine_contents" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "count" numeric DEFAULT 3,
    "block_name" varchar
  );

  CREATE TABLE "homepage_blocks_home_intro" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "block_name" varchar
  );

  CREATE TABLE "homepage_blocks_featured_posts" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "count" numeric DEFAULT 3,
    "block_name" varchar
  );

  CREATE TABLE "homepage_blocks_travel_list" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "count" numeric DEFAULT 3,
    "block_name" varchar
  );

  CREATE TABLE "homepage_blocks_research_list" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "count" numeric DEFAULT 3,
    "block_name" varchar
  );

  CREATE TABLE "homepage_blocks_curated_links_items" (
    "_order" integer NOT NULL,
    "_parent_id" varchar NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "description" varchar DEFAULT '',
    "href" varchar DEFAULT ''
  );

  CREATE TABLE "homepage_blocks_curated_links" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "body" varchar DEFAULT '',
    "block_name" varchar
  );

  CREATE TABLE "homepage_blocks_now_summary" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "body" varchar DEFAULT '',
    "block_name" varchar
  );

  CREATE TABLE "homepage_blocks_about_note" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "body" varchar DEFAULT '',
    "block_name" varchar
  );

  CREATE TABLE "homepage_blocks_quote" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "quote" varchar DEFAULT '',
    "block_name" varchar
  );

  CREATE TABLE "homepage_blocks_rich_text" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "body" varchar DEFAULT '',
    "block_name" varchar
  );

  CREATE TABLE "homepage" (
    "id" serial PRIMARY KEY NOT NULL,
    "layout_version" numeric DEFAULT 1,
    "hero_section_id" varchar,
    "hero_eyebrow" varchar DEFAULT '',
    "hero_title" varchar DEFAULT '',
    "hero_intro" varchar DEFAULT '',
    "hero_note" varchar DEFAULT '',
    "hero_primary_link_label" varchar DEFAULT '',
    "hero_primary_link_href" varchar DEFAULT '',
    "hero_secondary_link_label" varchar DEFAULT '',
    "hero_secondary_link_href" varchar DEFAULT '',
    "_status" "enum_homepage_status" DEFAULT 'draft',
    "updated_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone
  );

  CREATE TABLE "_homepage_v_blocks_magazine_cover" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "travel_slug" varchar DEFAULT '',
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_homepage_v_blocks_magazine_contents" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "count" numeric DEFAULT 3,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_homepage_v_blocks_home_intro" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_homepage_v_blocks_featured_posts" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "count" numeric DEFAULT 3,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_homepage_v_blocks_travel_list" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "count" numeric DEFAULT 3,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_homepage_v_blocks_research_list" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "count" numeric DEFAULT 3,
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_homepage_v_blocks_curated_links_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "description" varchar DEFAULT '',
    "href" varchar DEFAULT '',
    "_uuid" varchar
  );

  CREATE TABLE "_homepage_v_blocks_curated_links" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "body" varchar DEFAULT '',
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_homepage_v_blocks_now_summary" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "body" varchar DEFAULT '',
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_homepage_v_blocks_about_note" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "body" varchar DEFAULT '',
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_homepage_v_blocks_quote" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "quote" varchar DEFAULT '',
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_homepage_v_blocks_rich_text" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "section_id" varchar,
    "enabled" boolean DEFAULT true,
    "order" numeric,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "link_label" varchar DEFAULT '',
    "link_href" varchar DEFAULT '',
    "body" varchar DEFAULT '',
    "_uuid" varchar,
    "block_name" varchar
  );

  CREATE TABLE "_homepage_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "version_layout_version" numeric DEFAULT 1,
    "version_hero_section_id" varchar,
    "version_hero_eyebrow" varchar DEFAULT '',
    "version_hero_title" varchar DEFAULT '',
    "version_hero_intro" varchar DEFAULT '',
    "version_hero_note" varchar DEFAULT '',
    "version_hero_primary_link_label" varchar DEFAULT '',
    "version_hero_primary_link_href" varchar DEFAULT '',
    "version_hero_secondary_link_label" varchar DEFAULT '',
    "version_hero_secondary_link_href" varchar DEFAULT '',
    "version__status" "enum__homepage_v_version_status" DEFAULT 'draft',
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean,
    "autosave" boolean
  );

  CREATE TABLE "about_links" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "label" varchar DEFAULT '',
    "href" varchar DEFAULT ''
  );

  CREATE TABLE "about" (
    "id" serial PRIMARY KEY NOT NULL,
    "hero_eyebrow" varchar DEFAULT '',
    "hero_title" varchar DEFAULT '',
    "hero_intro" varchar DEFAULT '',
    "profile_card_section_label" varchar DEFAULT '',
    "profile_card_title" varchar DEFAULT '',
    "profile_card_body" varchar DEFAULT '',
    "profile_card_secondary_body" varchar DEFAULT '',
    "facts_section_label" varchar DEFAULT '',
    "facts_location_label" varchar DEFAULT '',
    "facts_location" varchar DEFAULT '',
    "facts_email_label" varchar DEFAULT '',
    "facts_email" varchar DEFAULT '',
    "facts_topics_label" varchar DEFAULT '',
    "facts_topics" varchar DEFAULT '',
    "_status" "enum_about_status" DEFAULT 'draft',
    "updated_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone
  );

  CREATE TABLE "_about_v_version_links" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "label" varchar DEFAULT '',
    "href" varchar DEFAULT '',
    "_uuid" varchar
  );

  CREATE TABLE "_about_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "version_hero_eyebrow" varchar DEFAULT '',
    "version_hero_title" varchar DEFAULT '',
    "version_hero_intro" varchar DEFAULT '',
    "version_profile_card_section_label" varchar DEFAULT '',
    "version_profile_card_title" varchar DEFAULT '',
    "version_profile_card_body" varchar DEFAULT '',
    "version_profile_card_secondary_body" varchar DEFAULT '',
    "version_facts_section_label" varchar DEFAULT '',
    "version_facts_location_label" varchar DEFAULT '',
    "version_facts_location" varchar DEFAULT '',
    "version_facts_email_label" varchar DEFAULT '',
    "version_facts_email" varchar DEFAULT '',
    "version_facts_topics_label" varchar DEFAULT '',
    "version_facts_topics" varchar DEFAULT '',
    "version__status" "enum__about_v_version_status" DEFAULT 'draft',
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean,
    "autosave" boolean
  );

  CREATE TABLE "now_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "text" varchar DEFAULT ''
  );

  CREATE TABLE "now" (
    "id" serial PRIMARY KEY NOT NULL,
    "eyebrow" varchar DEFAULT '',
    "title" varchar DEFAULT '',
    "intro" varchar DEFAULT '',
    "_status" "enum_now_status" DEFAULT 'draft',
    "updated_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone
  );

  CREATE TABLE "_now_v_version_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "text" varchar DEFAULT '',
    "_uuid" varchar
  );

  CREATE TABLE "_now_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "version_eyebrow" varchar DEFAULT '',
    "version_title" varchar DEFAULT '',
    "version_intro" varchar DEFAULT '',
    "version__status" "enum__now_v_version_status" DEFAULT 'draft',
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean,
    "autosave" boolean
  );

  CREATE TABLE "projects_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "title" varchar DEFAULT '',
    "status" varchar DEFAULT '',
    "description" varchar DEFAULT ''
  );

  CREATE TABLE "projects" (
    "id" serial PRIMARY KEY NOT NULL,
    "hero_eyebrow" varchar DEFAULT '',
    "hero_title" varchar DEFAULT '',
    "hero_intro" varchar DEFAULT '',
    "_status" "enum_projects_status" DEFAULT 'draft',
    "updated_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone
  );

  CREATE TABLE "_projects_v_version_items" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "title" varchar DEFAULT '',
    "status" varchar DEFAULT '',
    "description" varchar DEFAULT '',
    "_uuid" varchar
  );

  CREATE TABLE "_projects_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "version_hero_eyebrow" varchar DEFAULT '',
    "version_hero_title" varchar DEFAULT '',
    "version_hero_intro" varchar DEFAULT '',
    "version__status" "enum__projects_v_version_status" DEFAULT 'draft',
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean,
    "autosave" boolean
  );

  CREATE TABLE "tracks" (
    "id" serial PRIMARY KEY NOT NULL,
    "hero_eyebrow" varchar DEFAULT '',
    "hero_title" varchar DEFAULT '',
    "hero_intro" varchar DEFAULT '',
    "empty_title" varchar DEFAULT '',
    "empty_description" varchar DEFAULT '',
    "_status" "enum_tracks_status" DEFAULT 'draft',
    "updated_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone
  );

  CREATE TABLE "_tracks_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "version_hero_eyebrow" varchar DEFAULT '',
    "version_hero_title" varchar DEFAULT '',
    "version_hero_intro" varchar DEFAULT '',
    "version_empty_title" varchar DEFAULT '',
    "version_empty_description" varchar DEFAULT '',
    "version__status" "enum__tracks_v_version_status" DEFAULT 'draft',
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean,
    "autosave" boolean
  );

  CREATE TABLE "site_social_links" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "label" varchar DEFAULT '',
    "href" varchar DEFAULT ''
  );

  CREATE TABLE "site" (
    "id" serial PRIMARY KEY NOT NULL,
    "title" varchar DEFAULT '',
    "description" varchar DEFAULT '',
    "intro" varchar DEFAULT '',
    "about" varchar DEFAULT '',
    "email" varchar DEFAULT '',
    "location" varchar DEFAULT '',
    "_status" "enum_site_status" DEFAULT 'draft',
    "updated_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone
  );

  CREATE TABLE "_site_v_version_social_links" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "label" varchar DEFAULT '',
    "href" varchar DEFAULT '',
    "_uuid" varchar
  );

  CREATE TABLE "_site_v" (
    "id" serial PRIMARY KEY NOT NULL,
    "version_title" varchar DEFAULT '',
    "version_description" varchar DEFAULT '',
    "version_intro" varchar DEFAULT '',
    "version_about" varchar DEFAULT '',
    "version_email" varchar DEFAULT '',
    "version_location" varchar DEFAULT '',
    "version__status" "enum__site_v_version_status" DEFAULT 'draft',
    "version_updated_at" timestamp(3) with time zone,
    "version_created_at" timestamp(3) with time zone,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "latest" boolean,
    "autosave" boolean
  );

  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_tags" ADD CONSTRAINT "posts_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_links" ADD CONSTRAINT "posts_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_cover_id_media_id_fk" FOREIGN KEY ("cover_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_version_tags" ADD CONSTRAINT "_posts_v_version_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_version_links" ADD CONSTRAINT "_posts_v_version_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_parent_id_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_cover_id_media_id_fk" FOREIGN KEY ("version_cover_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_deployments_fk" FOREIGN KEY ("deployments_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_blocks_magazine_cover" ADD CONSTRAINT "homepage_blocks_magazine_cover_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_blocks_magazine_contents" ADD CONSTRAINT "homepage_blocks_magazine_contents_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_blocks_home_intro" ADD CONSTRAINT "homepage_blocks_home_intro_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_blocks_featured_posts" ADD CONSTRAINT "homepage_blocks_featured_posts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_blocks_travel_list" ADD CONSTRAINT "homepage_blocks_travel_list_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_blocks_research_list" ADD CONSTRAINT "homepage_blocks_research_list_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_blocks_curated_links_items" ADD CONSTRAINT "homepage_blocks_curated_links_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage_blocks_curated_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_blocks_curated_links" ADD CONSTRAINT "homepage_blocks_curated_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_blocks_now_summary" ADD CONSTRAINT "homepage_blocks_now_summary_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_blocks_about_note" ADD CONSTRAINT "homepage_blocks_about_note_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_blocks_quote" ADD CONSTRAINT "homepage_blocks_quote_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_blocks_rich_text" ADD CONSTRAINT "homepage_blocks_rich_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_homepage_v_blocks_magazine_cover" ADD CONSTRAINT "_homepage_v_blocks_magazine_cover_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_homepage_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_homepage_v_blocks_magazine_contents" ADD CONSTRAINT "_homepage_v_blocks_magazine_contents_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_homepage_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_homepage_v_blocks_home_intro" ADD CONSTRAINT "_homepage_v_blocks_home_intro_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_homepage_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_homepage_v_blocks_featured_posts" ADD CONSTRAINT "_homepage_v_blocks_featured_posts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_homepage_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_homepage_v_blocks_travel_list" ADD CONSTRAINT "_homepage_v_blocks_travel_list_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_homepage_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_homepage_v_blocks_research_list" ADD CONSTRAINT "_homepage_v_blocks_research_list_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_homepage_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_homepage_v_blocks_curated_links_items" ADD CONSTRAINT "_homepage_v_blocks_curated_links_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_homepage_v_blocks_curated_links"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_homepage_v_blocks_curated_links" ADD CONSTRAINT "_homepage_v_blocks_curated_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_homepage_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_homepage_v_blocks_now_summary" ADD CONSTRAINT "_homepage_v_blocks_now_summary_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_homepage_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_homepage_v_blocks_about_note" ADD CONSTRAINT "_homepage_v_blocks_about_note_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_homepage_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_homepage_v_blocks_quote" ADD CONSTRAINT "_homepage_v_blocks_quote_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_homepage_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_homepage_v_blocks_rich_text" ADD CONSTRAINT "_homepage_v_blocks_rich_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_homepage_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "about_links" ADD CONSTRAINT "about_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."about"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_about_v_version_links" ADD CONSTRAINT "_about_v_version_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_about_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "now_items" ADD CONSTRAINT "now_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."now"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_now_v_version_items" ADD CONSTRAINT "_now_v_version_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_now_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "projects_items" ADD CONSTRAINT "projects_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_projects_v_version_items" ADD CONSTRAINT "_projects_v_version_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_projects_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_social_links" ADD CONSTRAINT "site_social_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_site_v_version_social_links" ADD CONSTRAINT "_site_v_version_social_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_site_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "posts_tags_order_idx" ON "posts_tags" USING btree ("_order");
  CREATE INDEX "posts_tags_parent_id_idx" ON "posts_tags" USING btree ("_parent_id");
  CREATE INDEX "posts_links_order_idx" ON "posts_links" USING btree ("_order");
  CREATE INDEX "posts_links_parent_id_idx" ON "posts_links" USING btree ("_parent_id");
  CREATE INDEX "posts_cover_idx" ON "posts" USING btree ("cover_id");
  CREATE UNIQUE INDEX "posts_route_key_idx" ON "posts" USING btree ("route_key");
  CREATE INDEX "posts_updated_at_idx" ON "posts" USING btree ("updated_at");
  CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at");
  CREATE INDEX "posts__status_idx" ON "posts" USING btree ("_status");
  CREATE INDEX "_posts_v_version_tags_order_idx" ON "_posts_v_version_tags" USING btree ("_order");
  CREATE INDEX "_posts_v_version_tags_parent_id_idx" ON "_posts_v_version_tags" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_version_links_order_idx" ON "_posts_v_version_links" USING btree ("_order");
  CREATE INDEX "_posts_v_version_links_parent_id_idx" ON "_posts_v_version_links" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_parent_idx" ON "_posts_v" USING btree ("parent_id");
  CREATE INDEX "_posts_v_version_version_cover_idx" ON "_posts_v" USING btree ("version_cover_id");
  CREATE INDEX "_posts_v_version_version_route_key_idx" ON "_posts_v" USING btree ("version_route_key");
  CREATE INDEX "_posts_v_version_version_updated_at_idx" ON "_posts_v" USING btree ("version_updated_at");
  CREATE INDEX "_posts_v_version_version_created_at_idx" ON "_posts_v" USING btree ("version_created_at");
  CREATE INDEX "_posts_v_version_version__status_idx" ON "_posts_v" USING btree ("version__status");
  CREATE INDEX "_posts_v_created_at_idx" ON "_posts_v" USING btree ("created_at");
  CREATE INDEX "_posts_v_updated_at_idx" ON "_posts_v" USING btree ("updated_at");
  CREATE INDEX "_posts_v_latest_idx" ON "_posts_v" USING btree ("latest");
  CREATE INDEX "_posts_v_autosave_idx" ON "_posts_v" USING btree ("autosave");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE UNIQUE INDEX "deployments_event_key_idx" ON "deployments" USING btree ("event_key");
  CREATE INDEX "deployments_updated_at_idx" ON "deployments" USING btree ("updated_at");
  CREATE INDEX "deployments_created_at_idx" ON "deployments" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("posts_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_deployments_id_idx" ON "payload_locked_documents_rels" USING btree ("deployments_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX "homepage_blocks_magazine_cover_order_idx" ON "homepage_blocks_magazine_cover" USING btree ("_order");
  CREATE INDEX "homepage_blocks_magazine_cover_parent_id_idx" ON "homepage_blocks_magazine_cover" USING btree ("_parent_id");
  CREATE INDEX "homepage_blocks_magazine_cover_path_idx" ON "homepage_blocks_magazine_cover" USING btree ("_path");
  CREATE INDEX "homepage_blocks_magazine_contents_order_idx" ON "homepage_blocks_magazine_contents" USING btree ("_order");
  CREATE INDEX "homepage_blocks_magazine_contents_parent_id_idx" ON "homepage_blocks_magazine_contents" USING btree ("_parent_id");
  CREATE INDEX "homepage_blocks_magazine_contents_path_idx" ON "homepage_blocks_magazine_contents" USING btree ("_path");
  CREATE INDEX "homepage_blocks_home_intro_order_idx" ON "homepage_blocks_home_intro" USING btree ("_order");
  CREATE INDEX "homepage_blocks_home_intro_parent_id_idx" ON "homepage_blocks_home_intro" USING btree ("_parent_id");
  CREATE INDEX "homepage_blocks_home_intro_path_idx" ON "homepage_blocks_home_intro" USING btree ("_path");
  CREATE INDEX "homepage_blocks_featured_posts_order_idx" ON "homepage_blocks_featured_posts" USING btree ("_order");
  CREATE INDEX "homepage_blocks_featured_posts_parent_id_idx" ON "homepage_blocks_featured_posts" USING btree ("_parent_id");
  CREATE INDEX "homepage_blocks_featured_posts_path_idx" ON "homepage_blocks_featured_posts" USING btree ("_path");
  CREATE INDEX "homepage_blocks_travel_list_order_idx" ON "homepage_blocks_travel_list" USING btree ("_order");
  CREATE INDEX "homepage_blocks_travel_list_parent_id_idx" ON "homepage_blocks_travel_list" USING btree ("_parent_id");
  CREATE INDEX "homepage_blocks_travel_list_path_idx" ON "homepage_blocks_travel_list" USING btree ("_path");
  CREATE INDEX "homepage_blocks_research_list_order_idx" ON "homepage_blocks_research_list" USING btree ("_order");
  CREATE INDEX "homepage_blocks_research_list_parent_id_idx" ON "homepage_blocks_research_list" USING btree ("_parent_id");
  CREATE INDEX "homepage_blocks_research_list_path_idx" ON "homepage_blocks_research_list" USING btree ("_path");
  CREATE INDEX "homepage_blocks_curated_links_items_order_idx" ON "homepage_blocks_curated_links_items" USING btree ("_order");
  CREATE INDEX "homepage_blocks_curated_links_items_parent_id_idx" ON "homepage_blocks_curated_links_items" USING btree ("_parent_id");
  CREATE INDEX "homepage_blocks_curated_links_order_idx" ON "homepage_blocks_curated_links" USING btree ("_order");
  CREATE INDEX "homepage_blocks_curated_links_parent_id_idx" ON "homepage_blocks_curated_links" USING btree ("_parent_id");
  CREATE INDEX "homepage_blocks_curated_links_path_idx" ON "homepage_blocks_curated_links" USING btree ("_path");
  CREATE INDEX "homepage_blocks_now_summary_order_idx" ON "homepage_blocks_now_summary" USING btree ("_order");
  CREATE INDEX "homepage_blocks_now_summary_parent_id_idx" ON "homepage_blocks_now_summary" USING btree ("_parent_id");
  CREATE INDEX "homepage_blocks_now_summary_path_idx" ON "homepage_blocks_now_summary" USING btree ("_path");
  CREATE INDEX "homepage_blocks_about_note_order_idx" ON "homepage_blocks_about_note" USING btree ("_order");
  CREATE INDEX "homepage_blocks_about_note_parent_id_idx" ON "homepage_blocks_about_note" USING btree ("_parent_id");
  CREATE INDEX "homepage_blocks_about_note_path_idx" ON "homepage_blocks_about_note" USING btree ("_path");
  CREATE INDEX "homepage_blocks_quote_order_idx" ON "homepage_blocks_quote" USING btree ("_order");
  CREATE INDEX "homepage_blocks_quote_parent_id_idx" ON "homepage_blocks_quote" USING btree ("_parent_id");
  CREATE INDEX "homepage_blocks_quote_path_idx" ON "homepage_blocks_quote" USING btree ("_path");
  CREATE INDEX "homepage_blocks_rich_text_order_idx" ON "homepage_blocks_rich_text" USING btree ("_order");
  CREATE INDEX "homepage_blocks_rich_text_parent_id_idx" ON "homepage_blocks_rich_text" USING btree ("_parent_id");
  CREATE INDEX "homepage_blocks_rich_text_path_idx" ON "homepage_blocks_rich_text" USING btree ("_path");
  CREATE INDEX "homepage__status_idx" ON "homepage" USING btree ("_status");
  CREATE INDEX "_homepage_v_blocks_magazine_cover_order_idx" ON "_homepage_v_blocks_magazine_cover" USING btree ("_order");
  CREATE INDEX "_homepage_v_blocks_magazine_cover_parent_id_idx" ON "_homepage_v_blocks_magazine_cover" USING btree ("_parent_id");
  CREATE INDEX "_homepage_v_blocks_magazine_cover_path_idx" ON "_homepage_v_blocks_magazine_cover" USING btree ("_path");
  CREATE INDEX "_homepage_v_blocks_magazine_contents_order_idx" ON "_homepage_v_blocks_magazine_contents" USING btree ("_order");
  CREATE INDEX "_homepage_v_blocks_magazine_contents_parent_id_idx" ON "_homepage_v_blocks_magazine_contents" USING btree ("_parent_id");
  CREATE INDEX "_homepage_v_blocks_magazine_contents_path_idx" ON "_homepage_v_blocks_magazine_contents" USING btree ("_path");
  CREATE INDEX "_homepage_v_blocks_home_intro_order_idx" ON "_homepage_v_blocks_home_intro" USING btree ("_order");
  CREATE INDEX "_homepage_v_blocks_home_intro_parent_id_idx" ON "_homepage_v_blocks_home_intro" USING btree ("_parent_id");
  CREATE INDEX "_homepage_v_blocks_home_intro_path_idx" ON "_homepage_v_blocks_home_intro" USING btree ("_path");
  CREATE INDEX "_homepage_v_blocks_featured_posts_order_idx" ON "_homepage_v_blocks_featured_posts" USING btree ("_order");
  CREATE INDEX "_homepage_v_blocks_featured_posts_parent_id_idx" ON "_homepage_v_blocks_featured_posts" USING btree ("_parent_id");
  CREATE INDEX "_homepage_v_blocks_featured_posts_path_idx" ON "_homepage_v_blocks_featured_posts" USING btree ("_path");
  CREATE INDEX "_homepage_v_blocks_travel_list_order_idx" ON "_homepage_v_blocks_travel_list" USING btree ("_order");
  CREATE INDEX "_homepage_v_blocks_travel_list_parent_id_idx" ON "_homepage_v_blocks_travel_list" USING btree ("_parent_id");
  CREATE INDEX "_homepage_v_blocks_travel_list_path_idx" ON "_homepage_v_blocks_travel_list" USING btree ("_path");
  CREATE INDEX "_homepage_v_blocks_research_list_order_idx" ON "_homepage_v_blocks_research_list" USING btree ("_order");
  CREATE INDEX "_homepage_v_blocks_research_list_parent_id_idx" ON "_homepage_v_blocks_research_list" USING btree ("_parent_id");
  CREATE INDEX "_homepage_v_blocks_research_list_path_idx" ON "_homepage_v_blocks_research_list" USING btree ("_path");
  CREATE INDEX "_homepage_v_blocks_curated_links_items_order_idx" ON "_homepage_v_blocks_curated_links_items" USING btree ("_order");
  CREATE INDEX "_homepage_v_blocks_curated_links_items_parent_id_idx" ON "_homepage_v_blocks_curated_links_items" USING btree ("_parent_id");
  CREATE INDEX "_homepage_v_blocks_curated_links_order_idx" ON "_homepage_v_blocks_curated_links" USING btree ("_order");
  CREATE INDEX "_homepage_v_blocks_curated_links_parent_id_idx" ON "_homepage_v_blocks_curated_links" USING btree ("_parent_id");
  CREATE INDEX "_homepage_v_blocks_curated_links_path_idx" ON "_homepage_v_blocks_curated_links" USING btree ("_path");
  CREATE INDEX "_homepage_v_blocks_now_summary_order_idx" ON "_homepage_v_blocks_now_summary" USING btree ("_order");
  CREATE INDEX "_homepage_v_blocks_now_summary_parent_id_idx" ON "_homepage_v_blocks_now_summary" USING btree ("_parent_id");
  CREATE INDEX "_homepage_v_blocks_now_summary_path_idx" ON "_homepage_v_blocks_now_summary" USING btree ("_path");
  CREATE INDEX "_homepage_v_blocks_about_note_order_idx" ON "_homepage_v_blocks_about_note" USING btree ("_order");
  CREATE INDEX "_homepage_v_blocks_about_note_parent_id_idx" ON "_homepage_v_blocks_about_note" USING btree ("_parent_id");
  CREATE INDEX "_homepage_v_blocks_about_note_path_idx" ON "_homepage_v_blocks_about_note" USING btree ("_path");
  CREATE INDEX "_homepage_v_blocks_quote_order_idx" ON "_homepage_v_blocks_quote" USING btree ("_order");
  CREATE INDEX "_homepage_v_blocks_quote_parent_id_idx" ON "_homepage_v_blocks_quote" USING btree ("_parent_id");
  CREATE INDEX "_homepage_v_blocks_quote_path_idx" ON "_homepage_v_blocks_quote" USING btree ("_path");
  CREATE INDEX "_homepage_v_blocks_rich_text_order_idx" ON "_homepage_v_blocks_rich_text" USING btree ("_order");
  CREATE INDEX "_homepage_v_blocks_rich_text_parent_id_idx" ON "_homepage_v_blocks_rich_text" USING btree ("_parent_id");
  CREATE INDEX "_homepage_v_blocks_rich_text_path_idx" ON "_homepage_v_blocks_rich_text" USING btree ("_path");
  CREATE INDEX "_homepage_v_version_version__status_idx" ON "_homepage_v" USING btree ("version__status");
  CREATE INDEX "_homepage_v_created_at_idx" ON "_homepage_v" USING btree ("created_at");
  CREATE INDEX "_homepage_v_updated_at_idx" ON "_homepage_v" USING btree ("updated_at");
  CREATE INDEX "_homepage_v_latest_idx" ON "_homepage_v" USING btree ("latest");
  CREATE INDEX "_homepage_v_autosave_idx" ON "_homepage_v" USING btree ("autosave");
  CREATE INDEX "about_links_order_idx" ON "about_links" USING btree ("_order");
  CREATE INDEX "about_links_parent_id_idx" ON "about_links" USING btree ("_parent_id");
  CREATE INDEX "about__status_idx" ON "about" USING btree ("_status");
  CREATE INDEX "_about_v_version_links_order_idx" ON "_about_v_version_links" USING btree ("_order");
  CREATE INDEX "_about_v_version_links_parent_id_idx" ON "_about_v_version_links" USING btree ("_parent_id");
  CREATE INDEX "_about_v_version_version__status_idx" ON "_about_v" USING btree ("version__status");
  CREATE INDEX "_about_v_created_at_idx" ON "_about_v" USING btree ("created_at");
  CREATE INDEX "_about_v_updated_at_idx" ON "_about_v" USING btree ("updated_at");
  CREATE INDEX "_about_v_latest_idx" ON "_about_v" USING btree ("latest");
  CREATE INDEX "_about_v_autosave_idx" ON "_about_v" USING btree ("autosave");
  CREATE INDEX "now_items_order_idx" ON "now_items" USING btree ("_order");
  CREATE INDEX "now_items_parent_id_idx" ON "now_items" USING btree ("_parent_id");
  CREATE INDEX "now__status_idx" ON "now" USING btree ("_status");
  CREATE INDEX "_now_v_version_items_order_idx" ON "_now_v_version_items" USING btree ("_order");
  CREATE INDEX "_now_v_version_items_parent_id_idx" ON "_now_v_version_items" USING btree ("_parent_id");
  CREATE INDEX "_now_v_version_version__status_idx" ON "_now_v" USING btree ("version__status");
  CREATE INDEX "_now_v_created_at_idx" ON "_now_v" USING btree ("created_at");
  CREATE INDEX "_now_v_updated_at_idx" ON "_now_v" USING btree ("updated_at");
  CREATE INDEX "_now_v_latest_idx" ON "_now_v" USING btree ("latest");
  CREATE INDEX "_now_v_autosave_idx" ON "_now_v" USING btree ("autosave");
  CREATE INDEX "projects_items_order_idx" ON "projects_items" USING btree ("_order");
  CREATE INDEX "projects_items_parent_id_idx" ON "projects_items" USING btree ("_parent_id");
  CREATE INDEX "projects__status_idx" ON "projects" USING btree ("_status");
  CREATE INDEX "_projects_v_version_items_order_idx" ON "_projects_v_version_items" USING btree ("_order");
  CREATE INDEX "_projects_v_version_items_parent_id_idx" ON "_projects_v_version_items" USING btree ("_parent_id");
  CREATE INDEX "_projects_v_version_version__status_idx" ON "_projects_v" USING btree ("version__status");
  CREATE INDEX "_projects_v_created_at_idx" ON "_projects_v" USING btree ("created_at");
  CREATE INDEX "_projects_v_updated_at_idx" ON "_projects_v" USING btree ("updated_at");
  CREATE INDEX "_projects_v_latest_idx" ON "_projects_v" USING btree ("latest");
  CREATE INDEX "_projects_v_autosave_idx" ON "_projects_v" USING btree ("autosave");
  CREATE INDEX "tracks__status_idx" ON "tracks" USING btree ("_status");
  CREATE INDEX "_tracks_v_version_version__status_idx" ON "_tracks_v" USING btree ("version__status");
  CREATE INDEX "_tracks_v_created_at_idx" ON "_tracks_v" USING btree ("created_at");
  CREATE INDEX "_tracks_v_updated_at_idx" ON "_tracks_v" USING btree ("updated_at");
  CREATE INDEX "_tracks_v_latest_idx" ON "_tracks_v" USING btree ("latest");
  CREATE INDEX "_tracks_v_autosave_idx" ON "_tracks_v" USING btree ("autosave");
  CREATE INDEX "site_social_links_order_idx" ON "site_social_links" USING btree ("_order");
  CREATE INDEX "site_social_links_parent_id_idx" ON "site_social_links" USING btree ("_parent_id");
  CREATE INDEX "site__status_idx" ON "site" USING btree ("_status");
  CREATE INDEX "_site_v_version_social_links_order_idx" ON "_site_v_version_social_links" USING btree ("_order");
  CREATE INDEX "_site_v_version_social_links_parent_id_idx" ON "_site_v_version_social_links" USING btree ("_parent_id");
  CREATE INDEX "_site_v_version_version__status_idx" ON "_site_v" USING btree ("version__status");
  CREATE INDEX "_site_v_created_at_idx" ON "_site_v" USING btree ("created_at");
  CREATE INDEX "_site_v_updated_at_idx" ON "_site_v" USING btree ("updated_at");
  CREATE INDEX "_site_v_latest_idx" ON "_site_v" USING btree ("latest");
  CREATE INDEX "_site_v_autosave_idx" ON "_site_v" USING btree ("autosave");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "posts_tags" CASCADE;
  DROP TABLE "posts_links" CASCADE;
  DROP TABLE "posts" CASCADE;
  DROP TABLE "_posts_v_version_tags" CASCADE;
  DROP TABLE "_posts_v_version_links" CASCADE;
  DROP TABLE "_posts_v" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "deployments" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "homepage_blocks_magazine_cover" CASCADE;
  DROP TABLE "homepage_blocks_magazine_contents" CASCADE;
  DROP TABLE "homepage_blocks_home_intro" CASCADE;
  DROP TABLE "homepage_blocks_featured_posts" CASCADE;
  DROP TABLE "homepage_blocks_travel_list" CASCADE;
  DROP TABLE "homepage_blocks_research_list" CASCADE;
  DROP TABLE "homepage_blocks_curated_links_items" CASCADE;
  DROP TABLE "homepage_blocks_curated_links" CASCADE;
  DROP TABLE "homepage_blocks_now_summary" CASCADE;
  DROP TABLE "homepage_blocks_about_note" CASCADE;
  DROP TABLE "homepage_blocks_quote" CASCADE;
  DROP TABLE "homepage_blocks_rich_text" CASCADE;
  DROP TABLE "homepage" CASCADE;
  DROP TABLE "_homepage_v_blocks_magazine_cover" CASCADE;
  DROP TABLE "_homepage_v_blocks_magazine_contents" CASCADE;
  DROP TABLE "_homepage_v_blocks_home_intro" CASCADE;
  DROP TABLE "_homepage_v_blocks_featured_posts" CASCADE;
  DROP TABLE "_homepage_v_blocks_travel_list" CASCADE;
  DROP TABLE "_homepage_v_blocks_research_list" CASCADE;
  DROP TABLE "_homepage_v_blocks_curated_links_items" CASCADE;
  DROP TABLE "_homepage_v_blocks_curated_links" CASCADE;
  DROP TABLE "_homepage_v_blocks_now_summary" CASCADE;
  DROP TABLE "_homepage_v_blocks_about_note" CASCADE;
  DROP TABLE "_homepage_v_blocks_quote" CASCADE;
  DROP TABLE "_homepage_v_blocks_rich_text" CASCADE;
  DROP TABLE "_homepage_v" CASCADE;
  DROP TABLE "about_links" CASCADE;
  DROP TABLE "about" CASCADE;
  DROP TABLE "_about_v_version_links" CASCADE;
  DROP TABLE "_about_v" CASCADE;
  DROP TABLE "now_items" CASCADE;
  DROP TABLE "now" CASCADE;
  DROP TABLE "_now_v_version_items" CASCADE;
  DROP TABLE "_now_v" CASCADE;
  DROP TABLE "projects_items" CASCADE;
  DROP TABLE "projects" CASCADE;
  DROP TABLE "_projects_v_version_items" CASCADE;
  DROP TABLE "_projects_v" CASCADE;
  DROP TABLE "tracks" CASCADE;
  DROP TABLE "_tracks_v" CASCADE;
  DROP TABLE "site_social_links" CASCADE;
  DROP TABLE "site" CASCADE;
  DROP TABLE "_site_v_version_social_links" CASCADE;
  DROP TABLE "_site_v" CASCADE;
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_posts_type";
  DROP TYPE "public"."enum_posts_visibility";
  DROP TYPE "public"."enum_posts_status";
  DROP TYPE "public"."enum__posts_v_version_type";
  DROP TYPE "public"."enum__posts_v_version_visibility";
  DROP TYPE "public"."enum__posts_v_version_status";
  DROP TYPE "public"."enum_deployments_status";
  DROP TYPE "public"."enum_homepage_status";
  DROP TYPE "public"."enum__homepage_v_version_status";
  DROP TYPE "public"."enum_about_status";
  DROP TYPE "public"."enum__about_v_version_status";
  DROP TYPE "public"."enum_now_status";
  DROP TYPE "public"."enum__now_v_version_status";
  DROP TYPE "public"."enum_projects_status";
  DROP TYPE "public"."enum__projects_v_version_status";
  DROP TYPE "public"."enum_tracks_status";
  DROP TYPE "public"."enum__tracks_v_version_status";
  DROP TYPE "public"."enum_site_status";
  DROP TYPE "public"."enum__site_v_version_status";`)
}
