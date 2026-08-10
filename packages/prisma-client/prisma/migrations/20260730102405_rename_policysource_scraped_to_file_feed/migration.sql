-- Rename PolicySource.SCRAPED -> FILE_FEED.
-- Portal scraping is not an available ingestion path (insurer access terms,
-- Computer Crimes Act 1997); the sanctioned route is a structured file feed.
-- Safe as a rename: no rows use this value.
ALTER TYPE "PolicySource" RENAME VALUE 'SCRAPED' TO 'FILE_FEED';
