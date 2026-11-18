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
    customer_first_name text NOT NULL,
    customer_last_name text NOT NULL DEFAULT '',
    -- Kept in sync automatically, for display and search.
    customer_name text GENERATED ALWAYS AS (
        btrim(customer_first_name || ' ' || customer_last_name)
    ) STORED,
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

-- One-time "set your password" links for invites and resets. Only a hash
-- of each token is stored.
CREATE TABLE IF NOT EXISTS password_tokens (
    token_hash text PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose text NOT NULL CHECK (purpose IN ('invite', 'reset')),
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Columns added after the first release, for databases created before them.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
-- Invited users have no password until they choose one.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
-- Split the original single customer name into first and last name
-- (at the first space). Runs once, on databases from before the split.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'projects' AND column_name = 'customer_first_name'
    ) THEN
        ALTER TABLE projects
            ADD COLUMN customer_first_name text,
            ADD COLUMN customer_last_name text NOT NULL DEFAULT '';
        UPDATE projects SET
            customer_first_name = split_part(btrim(customer_name), ' ', 1),
            customer_last_name = btrim(substr(
                btrim(customer_name),
                length(split_part(btrim(customer_name), ' ', 1)) + 1
            ));
        ALTER TABLE projects ALTER COLUMN customer_first_name SET NOT NULL;
        ALTER TABLE projects DROP COLUMN customer_name;
        ALTER TABLE projects ADD COLUMN customer_name text GENERATED ALWAYS AS (
            btrim(customer_first_name || ' ' || customer_last_name)
        ) STORED;
    END IF;
END $$;
-- Answers asked when a project is created (see projectTypes.js).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS financing boolean NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS financing_provider text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS financing_other text NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS heats_with_gas boolean;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS integrated_controls boolean;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS controls_type text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS controls_other text NOT NULL DEFAULT '';
-- A task that isn't needed for this project (e.g. the natural gas bill
-- when the home doesn't heat with gas). Still listed, never required.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Application stages: todo (documents still coming in) -> submitted (sent
-- to Mass Save) -> done (rebate received). In Progress is worked out from
-- the uploads, not stored.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_state_check;
ALTER TABLE projects ADD CONSTRAINT projects_state_check
    CHECK (state IN ('todo', 'submitted', 'done'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS rebate_number text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS rebate_amount numeric(12, 2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS rebate_received_on date;

-- One-time data changes that have already run (see migrations.js).
CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    ran_at timestamptz NOT NULL DEFAULT now()
);
-- The Housecall Pro customer a project was created from, if any.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS housecall_customer_id text;
-- Notes and history keep their place after their author is deleted.
ALTER TABLE project_notes ALTER COLUMN author_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_project_id ON tasks (project_id);
CREATE INDEX IF NOT EXISTS tasks_owner_id ON tasks (owner_id);
CREATE INDEX IF NOT EXISTS attachments_task_id ON attachments (task_id);
CREATE INDEX IF NOT EXISTS project_notes_project_id ON project_notes (project_id);
CREATE INDEX IF NOT EXISTS history_project_id ON history (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS history_task_id ON history (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS history_created_at ON history (created_at DESC);
