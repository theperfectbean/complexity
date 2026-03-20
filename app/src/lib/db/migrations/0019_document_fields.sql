ALTER TABLE "documents" ADD COLUMN "mime_type" varchar(100);
ALTER TABLE "documents" ADD COLUMN "size_bytes" integer;
ALTER TABLE "documents" ADD COLUMN "extracted_text" text;
