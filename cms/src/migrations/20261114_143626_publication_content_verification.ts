import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_deployments_site_status" AS ENUM('waiting', 'verified', 'different', 'check-failed', 'not-tracked');
  ALTER TABLE "deployments" ADD COLUMN "content_binding" jsonb;
  ALTER TABLE "deployments" ADD COLUMN "site_status" "enum_deployments_site_status" DEFAULT 'not-tracked';
  ALTER TABLE "deployments" ADD COLUMN "site_checked_at" timestamp(3) with time zone;
  ALTER TABLE "deployments" ADD COLUMN "site_message" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "deployments" DROP COLUMN "content_binding";
  ALTER TABLE "deployments" DROP COLUMN "site_status";
  ALTER TABLE "deployments" DROP COLUMN "site_checked_at";
  ALTER TABLE "deployments" DROP COLUMN "site_message";
  DROP TYPE "public"."enum_deployments_site_status";`)
}
