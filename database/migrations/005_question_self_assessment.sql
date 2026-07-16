-- EduQuestAI: only proof/open-ended questions need student self-assessment
-- grading (reveal answer + self-report). Everything else goes back to
-- automatic exact-match grading, which is what most free-response questions
-- (e.g. "Solve for x: 2x+3=11") actually want -- self-assessment was
-- previously applied to every free-response question, which was more
-- friction than necessary for questions with a single definite answer.
alter table questions add column requires_self_assessment boolean not null default false;
