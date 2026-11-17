-- SCRUM-2: initial schema for the To-Do backend (SCRUM-2-AC-01, SCRUM-2-NFR-04)
CREATE TABLE tasks (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title       VARCHAR(200)  NOT NULL,
    description VARCHAR(2000),
    status      VARCHAR(20)   NOT NULL DEFAULT 'TODO',
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    due_date    DATE,
    CONSTRAINT ck_tasks_status CHECK (status IN ('TODO', 'IN_PROGRESS', 'DONE')),
    CONSTRAINT ck_tasks_title_not_blank CHECK (length(btrim(title)) > 0)
);

CREATE INDEX ix_tasks_created_at_id ON tasks (created_at DESC, id DESC);
