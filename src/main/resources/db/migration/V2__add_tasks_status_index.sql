-- SCRUM-6: supports status-filtered, newest-first listing (SCRUM-6-AC-05, SCRUM-6-NFR-02, SCRUM-6-NFR-08)
CREATE INDEX ix_tasks_status_created_at_id ON tasks (status, created_at DESC, id DESC);
