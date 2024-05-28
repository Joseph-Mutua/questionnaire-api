-- Insert a user if not exists
INSERT INTO users (email, password) 
VALUES ('Mutuaj793@gmail.com', '123456789') 
ON CONFLICT (email) DO NOTHING;

-- Get the user_id of the super-admin user
DO $$
DECLARE
    super_admin_id INTEGER;
BEGIN
    SELECT user_id INTO super_admin_id FROM users WHERE email = 'Mutuaj793@gmail.com';

    -- Insert the super-admin role for the user
    INSERT INTO user_roles (user_id, role)
    VALUES (super_admin_id, 'SUPERADMIN')
    ON CONFLICT (user_id, role) DO NOTHING;
END $$;
