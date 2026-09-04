-- Admin client upserts level_enrollments when unlocking a level in AdminUsersSection.
-- Table previously only had own-read SELECT; INSERT/UPDATE failed with RLS 403.
-- Pattern matches other admin write policies (exercise_sets, support_tickets, etc.).

CREATE POLICY "level_enrollments: admin all"
  ON level_enrollments
  FOR ALL
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
