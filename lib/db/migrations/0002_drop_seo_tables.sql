-- Vulnaguard Outreach is an outreach-only product. Drop the SEO-agent
-- tables (sessions/messages/results/inventory) and the content-pipeline
-- table entirely, plus their now-irrelevant ai_provider_config rows.

DROP TABLE IF EXISTS content_pipeline_records CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS results CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;

DELETE FROM ai_provider_config WHERE agent_name = 'content-pipeline';
DELETE FROM ai_provider_config WHERE agent_name IN ('seo-m1', 'seo-m2', 'seo-m3', 'seo-m4', 'seo-m5', 'seo-m6');
