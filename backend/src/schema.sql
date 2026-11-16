CREATE TABLE IF NOT EXISTS users (
    id serial PRIMARY KEY,
    username text NOT NULL UNIQUE,
    display_name text NOT NULL,
    email text,
    password_hash text NOT NULL,
    is_super boolean NOT NULL DEFAULT false,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash text PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    id serial PRIMARY KEY,
    type text NOT NULL,
    customer_name text NOT NULL,
    address text NOT NULL,
    due_date date,
    owner_id integer NOT NULL REFERENCES users (id),
    state text NOT NULL DEFAULT 'todo' CHECK (state IN ('todo', 'done')),
    -- Inactive projects are kept and still listed, just set aside.
    active boolean NOT NULL DEFAULT true,
    created_by integer REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

-- Tasks are created with their project and labeled #<project id><letter>,
-- e.g. #1a, #1b, #1c.
CREATE TABLE IF NOT EXISTS tasks (
    id serial PRIMARY KEY,
    project_id integer NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    letter text NOT NULL,
    name text NOT NULL,
    form_name text NOT NULL,
    owner_id integer NOT NULL REFERENCES users (id),
    state text NOT NULL DEFAULT 'todo' CHECK (state IN ('todo', 'done')),
    notes text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    UNIQUE (project_id, letter)
);

CREATE TABLE IF NOT EXISTS project_notes (
    id serial PRIMARY KEY,
    project_id integer NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    author_id integer NOT NULL REFERENCES users (id),
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attachments (
    id uuid PRIMARY KEY,
    task_id integer NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    filename text NOT NULL,
    mime_type text NOT NULL,
    size integer NOT NULL,
    data bytea NOT NULL,
    uploaded_by integer REFERENCES users (id),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Every change to a project or task. Rows are never edited except to mark
-- them undone; an undo is itself recorded as a new row.
CREATE TABLE IF NOT EXISTS history (
    id serial PRIMARY KEY,
    project_id integer NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    task_id integer REFERENCES tasks (id) ON DELETE CASCADE,
    actor_id integer REFERENCES users (id),
    action text NOT NULL,
    field text,
    old_value text,
    new_value text,
    undo_of integer REFERENCES history (id),
    undone_by integer REFERENCES users (id),
    undone_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Columns added after the first release, for databases created before them.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks (project_id);
CREATE INDEX IF NOT EXISTS tasks_owner_id ON tasks (owner_id);
CREATE INDEX IF NOT EXISTS attachments_task_id ON attachments (task_id);
CREATE INDEX IF NOT EXISTS project_notes_project_id ON project_notes (project_id);
CREATE INDEX IF NOT EXISTS history_project_id ON history (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS history_task_id ON history (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS history_created_at ON history (created_at DESC);
