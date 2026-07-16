-- EduQuestAI: let a PDF be tagged with a topic directly, independent of
-- extracted questions. Theory PDFs never produce questions (the extraction
-- pipeline only creates Question/Topic rows from Q&A content), so they had
-- no way to show up under a topic in the Library table at all.
-- ON DELETE SET NULL (not the FK-violation-prone no-op that questions.topic_id
-- had before the 2026-07-13 fix) so deleting a topic a theory PDF is tagged
-- to just clears the tag instead of crashing.
alter table pdfs add column topic_id uuid references topics(id) on delete set null;
