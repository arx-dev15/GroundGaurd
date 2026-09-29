-- 011_project_user_fk.sql
-- Ensure referential integrity between projects and users

-- 1. Remove orphan projects without valid users before enforcing constraint
DELETE FROM projects
WHERE user_id NOT IN (SELECT id FROM users);

-- 2. Add foreign key constraint with cascade delete
ALTER TABLE projects
ADD CONSTRAINT fk_projects_user_id
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
