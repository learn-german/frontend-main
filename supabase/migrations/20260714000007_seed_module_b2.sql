-- =============================================================================
-- DeutschPath — seed the missing B2 module (modules are fixed 1:1 with a level)
-- =============================================================================

INSERT INTO modules (id, level, title, title_vi, description, order_index)
VALUES ('m-b2-1', 'B2', 'Vertiefung & Diskussion', 'Nâng cao & Tranh biện', 'Tranh biện học thuật, viết luận, giao tiếp chuyên sâu', 4)
ON CONFLICT (id) DO NOTHING;
