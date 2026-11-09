# Dictionary adverbs and prepositions

Source: Notion 40f92cf518d8808a978ac4f42b6f1a5a and its comment requesting giới từ.
Add adverb (Trạng từ) and preposition (Giới từ) to the shared dictionary types used by Admin selection, publish validation and learner detail labels. Extend the existing database type CHECK; preserve all existing values, noun-only fields, RLS and publication requirements.

Approach: extend DICTIONARY_TYPES and the named CHECK. No new component, dependency, automatic word classification or data rewrite. Autonomous execution requested by user.
